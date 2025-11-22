import React, { useState } from 'react';
import { Client, Installment } from '../types';
import { formatCurrency } from '../constants';
import { Phone, User, Calendar, Trash2, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface ClientListProps {
  clients: Client[];
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
}

export const ClientList: React.FC<ClientListProps> = ({ clients, onDelete, onTogglePayment }) => {
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedClientId(expandedClientId === id ? null : id);
  };

  const getInstallmentStatusColor = (installment: Installment) => {
    if (installment.isPaid) return 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(installment.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'bg-red-500/10 border-red-500/50 text-red-400'; // Overdue (Vencido)
    if (diffDays <= 1) return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'; // Due tomorrow or today (A vencer/Hoje)
    
    return 'bg-slate-700/50 border-slate-600 text-slate-300'; // Future
  };

  const getStatusText = (installment: Installment) => {
    if (installment.isPaid) return 'PAGO';
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(installment.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'VENCIDO';
    if (diffDays === 0) return 'HOJE';
    if (diffDays === 1) return 'AMANHÃ';
    
    return 'ABERTO';
  }

  if (clients.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 border border-slate-700/50 rounded-xl border-dashed">
        <p className="text-slate-400">Nenhum cliente registrado na carteira.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400 uppercase font-bold">
            <tr>
              <th className="px-6 py-4">Cliente</th>
              <th className="px-6 py-4">Data Início</th>
              <th className="px-6 py-4">Principal</th>
              <th className="px-6 py-4">Progresso</th>
              <th className="px-6 py-4">Retorno Total</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {clients.map((client) => {
              const totalReturn = client.principal * (1 + client.interestRate / 100);
              const dateFormatted = client.startDate.split('-').reverse().join('/');
              const isExpanded = expandedClientId === client.id;
              
              // Calculate paid installments safely
              const paidCount = client.installmentsList ? client.installmentsList.filter(i => i.isPaid).length : 0;
              const progress = (paidCount / client.installments) * 100;

              return (
                <React.Fragment key={client.id}>
                  <tr className={`transition-colors ${isExpanded ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'}`}>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => toggleExpand(client.id)}>
                      <div className="flex flex-col">
                        <span className="font-medium text-white flex items-center gap-2">
                          <User size={14} className="text-blue-400"/> {client.name}
                        </span>
                        {client.phone && (
                          <span className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                            <Phone size={12} /> {client.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono">
                      {dateFormatted}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono">
                      {formatCurrency(client.principal)}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">{paidCount}/{client.installments}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                          <span className="text-white font-bold font-mono">
                              {formatCurrency(totalReturn)}
                          </span>
                          <span className="text-xs text-blue-400">
                              Lucro: +{client.interestRate.toFixed(1)}%
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                            onClick={() => toggleExpand(client.id)}
                            className="text-slate-400 hover:text-white p-2"
                        >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                        <button 
                          onClick={() => onDelete(client.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-2"
                          title="Remover Cliente"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Details - Installment List */}
                  {isExpanded && (
                      <tr className="bg-slate-800/80 shadow-inner">
                          <td colSpan={6} className="p-4 sm:p-6">
                            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
                                <h4 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                                    <Calendar size={16} /> Cronograma de Pagamentos
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {client.installmentsList?.map((inst) => {
                                        const statusColor = getInstallmentStatusColor(inst);
                                        const statusText = getStatusText(inst);
                                        const displayDate = inst.dueDate.split('-').reverse().join('/');

                                        return (
                                            <div key={inst.number} className={`border rounded-lg p-3 transition-all ${statusColor}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-mono font-bold text-sm">#{inst.number}</span>
                                                    <div className="text-xs font-bold px-2 py-0.5 rounded bg-black/20 uppercase">
                                                        {statusText}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <div className="text-xs opacity-70">Vencimento</div>
                                                        <div className="font-mono text-sm">{displayDate}</div>
                                                        <div className="font-bold text-lg mt-1">{formatCurrency(inst.value)}</div>
                                                    </div>
                                                    <button 
                                                        onClick={() => onTogglePayment(client.id, inst.number)}
                                                        className={`p-2 rounded-full transition-all ${inst.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                        title={inst.isPaid ? "Marcar como não pago" : "Marcar como pago"}
                                                    >
                                                        <CheckCircle size={20} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                          </td>
                      </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};