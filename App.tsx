import React, { useState, useEffect, useMemo } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency } from './constants';
import { analyzePortfolio } from './services/aiService';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { LayoutDashboard, Plus, BrainCircuit, Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('clients');
    return saved ? JSON.parse(saved) : [];
  });

  const [showForm, setShowForm] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [clients]);

  const addClient = (client: Client) => {
    setClients([client, ...clients]);
    setShowForm(false);
    // Clear previous AI insight as data changed
    setAiInsight('');
  };

  const removeClient = (id: string) => {
    setClients(clients.filter(c => c.id !== id));
    setAiInsight('');
  };

  const handleTogglePayment = (clientId: string, installmentNumber: number) => {
    setClients(prevClients => prevClients.map(client => {
      if (client.id !== clientId) return client;

      // If legacy client data doesn't have list, return as is (or could handle migration)
      if (!client.installmentsList) return client;

      const updatedInstallments = client.installmentsList.map(inst => {
        if (inst.number === installmentNumber) {
          return { ...inst, isPaid: !inst.isPaid };
        }
        return inst;
      });

      return {
        ...client,
        installmentsList: updatedInstallments
      };
    }));
  };

  const summary: FinancialSummary = useMemo(() => {
    const totalInvested = clients.reduce((sum, c) => sum + c.principal, 0);
    const totalRevenueExpected = clients.reduce((sum, c) => sum + (c.principal * (1 + c.interestRate / 100)), 0);
    
    // Calculate actually received profit based on paid installments? 
    // For simplicity in summary card, keeping expected. 
    // But let's calculate Profit based on expected return vs invested.
    const totalProfit = totalRevenueExpected - totalInvested;
    
    return {
      totalInvested,
      totalRevenueExpected,
      totalProfit,
      activeClients: clients.length,
      averageRoi: clients.length ? (totalProfit / totalInvested) * 100 : 0
    };
  }, [clients]);

  const progressionData = useMemo(() => calculateProgression(clients), [clients]);

  const handleAiAnalysis = async () => {
    if (clients.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzePortfolio(clients);
    setAiInsight(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-12">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <LayoutDashboard className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Giliarde <span className="text-emerald-500">AGI</span></h1>
          </div>
          <button 
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Plus size={18} /> {showForm ? 'Cancelar' : 'Novo Empréstimo'}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* KPI Section */}
        <DashboardCards summary={summary} />

        {/* Form Section */}
        {showForm && (
          <ClientForm onAddClient={addClient} onCancel={() => setShowForm(false)} />
        )}

        {/* Charts Section */}
        {clients.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2">
              <ChartSection data={progressionData} />
            </div>
            
            {/* AI Analysis Section */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <BrainCircuit className="text-purple-400" /> Análise Inteligente
                </h2>
                <button 
                  onClick={handleAiAnalysis}
                  disabled={isAnalyzing || clients.length === 0}
                  className="text-xs bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
                >
                  {isAnalyzing ? 'Analisando...' : 'Gerar Relatório'}
                </button>
              </div>
              
              <div className="flex-1 bg-slate-900 rounded-lg p-4 border border-slate-700 overflow-y-auto max-h-[300px]">
                {isAnalyzing ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="animate-spin" size={32} />
                    <p>Consultando IA...</p>
                  </div>
                ) : aiInsight ? (
                  <div className="prose prose-invert prose-sm text-slate-300 whitespace-pre-line">
                    {aiInsight}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 text-center">
                    <p>Clique em "Gerar Relatório" para receber uma análise da sua carteira de clientes usando Gemini AI.</p>
                  </div>
                )}
              </div>
              
              {clients.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700 text-xs text-slate-500">
                  <p>ROI Médio da Carteira: <span className="text-emerald-400 font-bold">{summary.averageRoi.toFixed(1)}%</span></p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Client List */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6 pl-1 border-l-4 border-emerald-500">Carteira de Clientes</h2>
          <ClientList 
            clients={clients} 
            onDelete={removeClient} 
            onTogglePayment={handleTogglePayment}
          />
        </div>

      </main>
    </div>
  );
};

export default App;