import React, { useState, useMemo, useEffect } from 'react';
import { Client, Installment } from '../types';
import { generateId, formatCurrency } from '../constants';
import { Plus, Save, X, Calculator, Pencil } from 'lucide-react';

interface ClientFormProps {
  onSave: (client: Client) => void;
  onCancel: () => void;
  initialData?: Client | null;
}

export const ClientForm: React.FC<ClientFormProps> = ({ onSave, onCancel, initialData }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('');
  const [phone, setPhone] = useState('');
  const [installmentValue, setInstallmentValue] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  // Load initial data if editing
  useEffect(() => {
    if (initialData) {
        setName(initialData.name);
        setPhone(initialData.phone);
        setAmount(initialData.principal.toString());
        setInstallments(initialData.installments.toString());
        setStartDate(initialData.startDate);
        
        // Try to get installment value from the first installment
        if (initialData.installmentsList && initialData.installmentsList.length > 0) {
            setInstallmentValue(initialData.installmentsList[0].value.toString());
        }
    }
  }, [initialData]);

  // Real-time calculations
  const calculationStats = useMemo(() => {
    const principal = parseFloat(amount) || 0;
    const inst = parseFloat(installments) || 0;
    const valParcela = parseFloat(installmentValue) || 0;

    if (principal === 0 || inst === 0 || valParcela === 0) {
      return { rate: 0, total: 0, profit: 0 };
    }

    const totalReceivable = valParcela * inst;
    const profit = totalReceivable - principal;
    const rate = (profit / principal) * 100;

    return {
      rate: rate, // Can be negative if losing money
      total: totalReceivable,
      profit: profit
    };
  }, [amount, installments, installmentValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const principal = parseFloat(amount);
    const inst = parseInt(installments);
    const valParcela = parseFloat(installmentValue);

    if (!name || isNaN(principal) || isNaN(inst) || isNaN(valParcela)) return;

    // Calculate final rate to store in the standardized Client model
    const totalReceivable = valParcela * inst;
    const calculatedRate = ((totalReceivable - principal) / principal) * 100;

    // Generate Installments List
    const generatedInstallments: Installment[] = [];
    const initialDate = new Date(startDate);

    for (let i = 1; i <= inst; i++) {
        // Create a new date object for each month to avoid reference issues
        const dueDate = new Date(initialDate);
        // Assuming 1 month gap between installments
        dueDate.setMonth(initialDate.getMonth() + i);
        
        // If editing, try to preserve the 'isPaid' status if the installment number exists
        let isPaid = false;
        if (initialData && initialData.installmentsList) {
            const existing = initialData.installmentsList.find(x => x.number === i);
            if (existing) {
                isPaid = existing.isPaid;
            }
        }
        
        generatedInstallments.push({
            number: i,
            dueDate: dueDate.toISOString().split('T')[0],
            value: valParcela,
            isPaid: isPaid
        });
    }

    const clientToSave: Client = {
      id: initialData ? initialData.id : generateId(), // Preserve ID if editing
      name,
      phone,
      principal,
      installments: inst,
      interestRate: calculatedRate, // Storing the derived rate
      startDate: startDate,
      status: initialData ? initialData.status : 'Active', // Preserve status logic handles updates elsewhere
      installmentsList: generatedInstallments,
      isDeleted: false,
      lastUpdated: Date.now()
    };

    onSave(clientToSave);
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8 shadow-lg animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {initialData ? <Pencil size={20} className="text-blue-400" /> : <Plus size={20} className="text-emerald-400" />} 
          {initialData ? 'Editar Contrato' : 'Novo Cliente'}
        </h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Nome do Cliente</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
            placeholder="Ex: João Silva"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Telefone</label>
          <input 
            type="tel" 
            value={phone} 
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
            placeholder="(00) 00000-0000"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Data do Empréstimo</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Valor Solicitado (Principal)</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-slate-500">R$</span>
            <input 
              type="number" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-emerald-500"
              placeholder="0.00"
              step="0.01"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1 uppercase font-bold">Qtde. Parcelas</label>
          <input 
            type="number" 
            value={installments} 
            onChange={(e) => setInstallments(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-emerald-500"
            placeholder="Ex: 10"
            required
          />
        </div>

        <div>
          <label className="block text-xs text-emerald-400 mb-1 uppercase font-bold">Valor da Parcela</label>
          <div className="relative">
             <span className="absolute left-3 top-2 text-emerald-600">R$</span>
            <input 
              type="number" 
              value={installmentValue} 
              onChange={(e) => setInstallmentValue(e.target.value)}
              className="w-full bg-slate-900 border border-emerald-500/50 text-emerald-300 font-bold rounded-lg pl-8 pr-4 py-2 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              placeholder="0.00"
              step="0.01"
              required
            />
          </div>
        </div>

        {/* Live Calculation Preview */}
        <div className="lg:col-span-3 bg-slate-900/50 rounded-lg p-4 border border-slate-700 mt-2 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-slate-800 p-2 rounded-full">
                    <Calculator size={20} className="text-purple-400" />
                </div>
                <div>
                    <p className="text-xs text-slate-400 uppercase">Retorno Total</p>
                    <p className="text-lg font-bold text-white">{formatCurrency(calculationStats.total)}</p>
                </div>
            </div>

            <div className="h-8 w-px bg-slate-700 hidden md:block"></div>

            <div>
                <p className="text-xs text-slate-400 uppercase">Lucro Previsto</p>
                <p className="text-lg font-bold text-emerald-400">+{formatCurrency(calculationStats.profit)}</p>
            </div>

             <div className="h-8 w-px bg-slate-700 hidden md:block"></div>

            <div>
                <p className="text-xs text-slate-400 uppercase">Taxa Calculada</p>
                <p className={`text-lg font-bold ${calculationStats.rate >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {calculationStats.rate.toFixed(2)}%
                </p>
            </div>

             <div className="flex-grow flex justify-end">
                <button 
                    type="submit" 
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20"
                >
                    <Save size={18} /> {initialData ? 'Atualizar' : 'Registrar'}
                </button>
            </div>
        </div>

      </form>
    </div>
  );
};