import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency } from './constants';
import { analyzePortfolio } from './services/aiService';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { LayoutDashboard, Plus, BrainCircuit, Loader2, Bell, CheckCircle, Database, Download, Upload, FileJson } from 'lucide-react';

const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('clients');
    return saved ? JSON.parse(saved) : [];
  });

  const [showForm, setShowForm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs for click outside handling
  const notificationRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [clients]);

  // Notification Logic
  const notifications = useMemo(() => {
    const alerts: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    clients.forEach(client => {
      if (!client.installmentsList) return;

      client.installmentsList.forEach(inst => {
        if (inst.isPaid) return;

        const dueDate = new Date(inst.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Logic: Overdue (< 0) OR Due Today (0) OR Due Tomorrow (1)
        if (diffDays <= 1) {
          alerts.push({
            clientId: client.id,
            clientName: client.name,
            installmentNumber: inst.number,
            value: inst.value,
            dueDate: inst.dueDate,
            daysDue: diffDays
          });
        }
      });
    });

    // Sort: Overdue first, then today, then tomorrow
    return alerts.sort((a, b) => a.daysDue - b.daysDue);
  }, [clients]);

  const addClient = (client: Client) => {
    setClients([client, ...clients]);
    setShowForm(false);
    setAiInsight('');
  };

  const removeClient = (id: string) => {
    if(window.confirm('Tem certeza que deseja remover este cliente? Todos os dados serão perdidos.')) {
      setClients(clients.filter(c => c.id !== id));
      setAiInsight('');
    }
  };

  const handleTogglePayment = (clientId: string, installmentNumber: number) => {
    setClients(prevClients => prevClients.map(client => {
      if (client.id !== clientId) return client;

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

  // Data Persistence Handlers
  const handleExportData = () => {
    const dataStr = JSON.stringify(clients, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `giliarde-agi-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowSettings(false);
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
           if(window.confirm(`Encontrados ${parsed.length} clientes no arquivo. Deseja substituir sua lista atual por estes dados?`)) {
              setClients(parsed);
              alert('Dados importados com sucesso!');
              setShowSettings(false);
           }
        } else if (Array.isArray(parsed) && parsed.length === 0) {
            if(window.confirm('O arquivo está vazio. Deseja limpar sua lista atual?')) {
                setClients([]);
                setShowSettings(false);
            }
        } else {
          alert('Arquivo inválido. Certifique-se de usar um backup gerado pelo Giliarde AGI.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao ler o arquivo. O formato pode estar corrompido.');
      }
      // Reset input value to allow selecting same file again if needed
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const summary: FinancialSummary = useMemo(() => {
    const totalInvested = clients.reduce((sum, c) => sum + c.principal, 0);
    const totalRevenueExpected = clients.reduce((sum, c) => sum + (c.principal * (1 + c.interestRate / 100)), 0);
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

  const formatNotificationDate = (daysDue: number) => {
    if (daysDue < 0) return `Atrasado há ${Math.abs(daysDue)} dias`;
    if (daysDue === 0) return 'Vence Hoje';
    return 'Vence Amanhã';
  };

  const getNotificationColor = (daysDue: number) => {
    if (daysDue < 0) return 'text-red-400 border-red-500/30 bg-red-500/10';
    if (daysDue === 0) return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
    return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
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
          
          <div className="flex items-center gap-2 sm:gap-4">
             {/* Data/Settings Menu */}
            <div className="relative" ref={settingsRef}>
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-lg transition-all ${showSettings ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    title="Banco de Dados / Sincronização"
                >
                    <Database size={20} />
                </button>

                {showSettings && (
                    <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in p-2">
                        <div className="text-xs font-bold text-slate-500 uppercase px-2 py-1 mb-1">Dados & Backup</div>
                        
                        <button 
                            onClick={handleExportData}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                        >
                            <Download size={16} className="text-blue-400" />
                            <span>Baixar Backup (JSON)</span>
                        </button>
                        
                        <label className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer relative">
                            <Upload size={16} className="text-emerald-400" />
                            <span>Restaurar Backup</span>
                            <input 
                                type="file" 
                                accept=".json" 
                                onChange={handleImportData}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </label>
                        
                        <div className="border-t border-slate-800 mt-2 pt-2 px-3 pb-1">
                            <p className="text-[10px] text-slate-500 leading-tight">
                                Use isso para transferir dados entre Celular e PC. Os dados são salvos localmente no seu dispositivo.
                            </p>
                        </div>
                    </div>
                )}
            </div>


            {/* Notification Bell */}
            <div className="relative" ref={notificationRef}>
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-lg transition-all relative ${showNotifications ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <Bell size={20} />
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center text-white animate-pulse">
                    {notifications.length}
                  </span>
                )}
              </button>

              {/* Dropdown Panel */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">Notificações</h3>
                    <span className="text-xs text-slate-500">{notifications.length} pendentes</span>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-8 text-center text-slate-500">
                        <CheckCircle size={32} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Tudo em dia, chefe.</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {notifications.map((notif, idx) => (
                          <div key={idx} className={`p-4 hover:bg-slate-800/50 transition-colors border-l-4 ${notif.daysDue < 0 ? 'border-l-red-500' : notif.daysDue === 0 ? 'border-l-orange-500' : 'border-l-yellow-500'}`}>
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-white text-sm">{notif.clientName}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getNotificationColor(notif.daysDue)}`}>
                                {formatNotificationDate(notif.daysDue)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-slate-400">
                              <span>Parcela #{notif.installmentNumber}</span>
                              <span className="text-white font-mono">{formatCurrency(notif.value)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors text-sm md:text-base whitespace-nowrap"
            >
              <Plus size={18} /> <span className="hidden md:inline">{showForm ? 'Cancelar' : 'Novo Empréstimo'}</span>
            </button>
          </div>
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