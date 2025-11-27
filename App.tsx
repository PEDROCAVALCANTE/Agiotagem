import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency, DEFAULT_FIREBASE_CONFIG } from './constants';
import { analyzePortfolio } from './services/aiService';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { initFirebase, subscribeToClients, saveClientToCloud, syncAllToCloud, isCloudEnabled, FirebaseConfig } from './services/cloudService';
import { LayoutDashboard, Plus, BrainCircuit, Loader2, Bell, Cloud, CloudOff, X, Save, Search } from 'lucide-react';

const App: React.FC = () => {
  // Cloud Config State - Default to the hardcoded config provided by user
  const [cloudConfig, setCloudConfig] = useState<FirebaseConfig | null>(DEFAULT_FIREBASE_CONFIG);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [configInput, setConfigInput] = useState(JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2));

  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('clients');
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            return parsed.map((c: any) => ({
                ...c,
                status: c.status || 'Active',
                lastUpdated: c.lastUpdated || Date.now(),
                isDeleted: c.isDeleted || false
            }));
        }
        return [];
    } catch (e) {
        console.error("Failed to parse clients", e);
        return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');

  // Filter out soft-deleted clients for the UI and Sort Alphabetically
  const activeClients = useMemo(() => {
    return clients
      .filter(c => !c.isDeleted)
      .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, searchQuery]);

  const [showForm, setShowForm] = useState(false);
  const [clientToDuplicate, setClientToDuplicate] = useState<Client | null>(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Refs
  const notificationRef = useRef<HTMLDivElement>(null);

  // Initialize Cloud on Mount
  useEffect(() => {
    if (cloudConfig) {
      const success = initFirebase(cloudConfig);
      setIsCloudConnected(success);
      if (success) {
        // Start listening to real-time updates
        const unsubscribe = subscribeToClients((updatedClients) => {
            setClients(prev => {
                // When cloud updates, we replace local state with cloud state
                // This ensures sync. In a more complex app, we'd merge strategies.
                return updatedClients.map(c => ({
                    ...c,
                    status: c.status || 'Active',
                    isDeleted: c.isDeleted || false
                }));
            });
        });
        return () => unsubscribe();
      }
    }
  }, [cloudConfig]);

  // Persist LocalStorage (Backup)
  useEffect(() => {
    localStorage.setItem('clients', JSON.stringify(clients));
  }, [clients]);

  const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Status check
  useEffect(() => {
    setClients(prevClients => {
      let hasChanges = false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const updated = prevClients.map(client => {
        if (client.isDeleted || client.status === 'Completed') return client;

        const isLate = client.installmentsList.some(inst => !inst.isPaid && new Date(inst.dueDate) < today);
        const newStatus = isLate ? 'Late' : 'Active';

        if (client.status !== newStatus) {
          hasChanges = true;
          return { ...client, status: newStatus };
        }
        return client;
      });

      // Avoid infinite loop by only updating if actually changed
      return hasChanges ? updated : prevClients;
    });
  }, []);

  // Notification Logic
  const notifications = useMemo(() => {
    const alerts: { clientName: string; installment: number; value: number; days: number; status: 'overdue' | 'due' }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    activeClients.forEach(client => {
      client.installmentsList?.forEach(inst => {
        if (!inst.isPaid) {
          const dueDate = new Date(inst.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          const diffTime = dueDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 0) {
             alerts.push({ clientName: client.name, installment: inst.number, value: inst.value, days: diffDays, status: 'overdue' });
          } else if (diffDays <= 1) {
             alerts.push({ clientName: client.name, installment: inst.number, value: inst.value, days: diffDays, status: 'due' });
          }
        }
      });
    });
    return alerts;
  }, [activeClients]);

  const progressionData = useMemo(() => calculateProgression(activeClients), [activeClients]);

  const financialSummary: FinancialSummary = useMemo(() => {
    return activeClients.reduce((acc, client) => {
      const totalReturn = client.principal * (1 + client.interestRate / 100);
      const profit = totalReturn - client.principal;
      
      const paidInstallments = client.installmentsList?.filter(i => i.isPaid).length || 0;
      const roi = client.interestRate;

      return {
        totalInvested: acc.totalInvested + client.principal,
        totalRevenueExpected: acc.totalRevenueExpected + totalReturn,
        totalProfit: acc.totalProfit + profit,
        activeClients: acc.activeClients + 1,
        averageRoi: acc.averageRoi + roi
      };
    }, { totalInvested: 0, totalRevenueExpected: 0, totalProfit: 0, activeClients: 0, averageRoi: 0 });
  }, [activeClients]);

  // Adjust average ROI
  if (financialSummary.activeClients > 0) {
    financialSummary.averageRoi = financialSummary.averageRoi / financialSummary.activeClients;
  }

  const handleCloudConfigSubmit = () => {
    try {
        const config = JSON.parse(configInput);
        setCloudConfig(config);
        setShowCloudModal(false);
        // Attempt to sync current local data to cloud immediately upon connection
        if (activeClients.length > 0) {
             setTimeout(() => {
                 if (isCloudEnabled()) syncAllToCloud(activeClients);
             }, 1000);
        }
    } catch (e) {
        alert("JSON inválido. Verifique suas credenciais.");
    }
  };

  const handleDisconnectCloud = () => {
    setCloudConfig(null);
    setIsCloudConnected(false);
    window.location.reload(); // Force reload to clear connections
  };

  const handleAddClient = (newClient: Client) => {
    // Optimistic Update
    setClients(prev => [...prev, newClient]);
    
    // Cloud Sync
    if (isCloudConnected) {
        saveClientToCloud(newClient);
    }
    setShowForm(false);
    setClientToDuplicate(null);
  };

  const handleDuplicateClient = (client: Client) => {
    setClientToDuplicate(client);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateAnnotation = (clientId: string, annotation: string) => {
    setClients(prev => {
        const updated = prev.map(c => {
            if (c.id === clientId) {
                const newClient = { ...c, annotation, lastUpdated: Date.now() };
                if (isCloudConnected) saveClientToCloud(newClient);
                return newClient;
            }
            return c;
        });
        return updated;
    });
  };

  const handleDeleteClient = (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este cliente?')) {
      const timestamp = Date.now();
      let deletedClient: Client | undefined;

      setClients(prev => prev.map(c => {
        if (c.id === id) {
            deletedClient = { ...c, isDeleted: true, lastUpdated: timestamp };
            return deletedClient;
        }
        return c;
      }));

      if (isCloudConnected && deletedClient) {
        saveClientToCloud(deletedClient);
      }
    }
  };

  const handleTogglePayment = (clientId: string, installmentNumber: number) => {
    let updatedClient: Client | undefined;

    setClients(prev => prev.map(client => {
      if (client.id === clientId) {
        const updatedInstallments = client.installmentsList.map(inst => 
          inst.number === installmentNumber ? { ...inst, isPaid: !inst.isPaid } : inst
        );

        // Check completion status
        const allPaid = updatedInstallments.every(i => i.isPaid);
        const newStatus = allPaid ? 'Completed' : (client.status === 'Completed' ? 'Active' : client.status);

        updatedClient = { 
            ...client, 
            installmentsList: updatedInstallments, 
            status: newStatus,
            lastUpdated: Date.now() 
        };
        return updatedClient;
      }
      return client;
    }));

    if (isCloudConnected && updatedClient) {
        saveClientToCloud(updatedClient);
    }
  };

  const generateReport = async () => {
    setIsAnalyzing(true);
    const analysis = await analyzePortfolio(activeClients);
    setAiInsight(analysis);
    setIsAnalyzing(false);
  };

  // Seed Data function for empty states
  const handleSeedData = () => {
      // Implement a simple seeder if needed, or rely on cloud data
  };

  return (
    <div className="min-h-screen pb-10">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-50 backdrop-blur-md bg-opacity-90">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-emerald-500 p-2 rounded-lg shadow-lg shadow-emerald-500/20">
               <LayoutDashboard className="text-white" size={24} />
             </div>
             <div>
                 <h1 className="text-xl font-bold text-white tracking-tight">Giliarde <span className="text-emerald-400">AGI</span></h1>
                 <p className="text-xs text-slate-500 font-mono hidden sm:block">Gestão Inteligente de Carteira</p>
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Cloud Status */}
            <button 
                onClick={() => setShowCloudModal(true)}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-all ${isCloudConnected ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}
            >
                {isCloudConnected ? <Cloud size={14} /> : <CloudOff size={14} />}
                <span className="hidden sm:inline">{isCloudConnected ? 'Online' : 'Offline'}</span>
            </button>

            {/* Notifications */}
            <div className="relative" ref={notificationRef}>
                <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 text-slate-400 hover:text-white relative transition-colors"
                >
                    <Bell size={22} />
                    {notifications.length > 0 && (
                        <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                            {notifications.length}
                        </span>
                    )}
                </button>

                {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in-down">
                        <div className="p-3 bg-slate-900 border-b border-slate-700 font-bold text-sm text-slate-300">
                            Cobranças ({notifications.length})
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">Nenhuma pendência urgente.</div>
                            ) : (
                                notifications.map((notif, idx) => (
                                    <div key={idx} className="p-3 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors flex items-center justify-between">
                                        <div>
                                            <p className="font-bold text-white text-sm">{notif.clientName}</p>
                                            <p className="text-xs text-slate-400">Parc. #{notif.installment} - {formatCurrency(notif.value)}</p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${notif.status === 'overdue' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                            {notif.status === 'overdue' ? 'Vencido' : (notif.days === 0 ? 'Vence Hoje' : 'Vence Amanhã')}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button 
              onClick={() => {
                  setClientToDuplicate(null);
                  setShowForm(!showForm);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white p-2 rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6">
        
        {/* Dashboard KPIs */}
        <DashboardCards summary={financialSummary} />

        {/* AI Analysis Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
                <BrainCircuit size={120} className="text-purple-500" />
            </div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 relative z-10">
                <div className="flex items-center gap-3 mb-4 md:mb-0">
                    <div className="bg-purple-500/20 p-2 rounded-lg">
                        <BrainCircuit className="text-purple-400" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Análise Inteligente</h2>
                        <p className="text-slate-400 text-xs">Powered by Gemini AI</p>
                    </div>
                </div>
                <button 
                    onClick={generateReport}
                    disabled={isAnalyzing}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
                    Gerar Relatório
                </button>
            </div>

            {aiInsight ? (
                <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50 text-slate-300 text-sm leading-relaxed whitespace-pre-line animate-fade-in relative z-10">
                    {aiInsight}
                </div>
            ) : (
                <div className="bg-slate-900/30 rounded-lg p-8 border border-slate-700/30 text-center relative z-10">
                    <p className="text-slate-500">Clique em "Gerar Relatório" para receber uma análise da sua carteira de clientes usando Gemini AI.</p>
                </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2 text-xs text-slate-500 relative z-10">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                ROI Médio da Carteira: <span className="text-emerald-400 font-bold">{financialSummary.averageRoi.toFixed(1)}%</span>
            </div>
        </div>

        {/* Chart Section */}
        <ChartSection data={progressionData} />

        {/* Client Form */}
        {showForm && (
          <ClientForm 
            onAddClient={handleAddClient} 
            onCancel={() => {
                setShowForm(false);
                setClientToDuplicate(null);
            }} 
            initialData={clientToDuplicate}
          />
        )}

        {/* Client List Header & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 pl-1 border-l-4 border-emerald-500">
                <h2 className="text-xl font-bold text-white">Carteira de Clientes</h2>
            </div>
            
            <div className="relative w-full md:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="text-slate-500" size={18} />
                </div>
                <input 
                    type="text" 
                    className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 p-2.5 placeholder-slate-500 transition-colors focus:outline-none" 
                    placeholder="Buscar por nome..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
        </div>

        {/* Client List */}
        <ClientList 
          clients={activeClients} 
          onDelete={handleDeleteClient}
          onTogglePayment={handleTogglePayment}
          onDuplicate={handleDuplicateClient}
          onUpdateAnnotation={handleUpdateAnnotation}
        />
      </main>

      {/* Cloud Config Modal */}
      {showCloudModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Cloud className="text-blue-400" /> Configurar Nuvem (Firebase)
                    </h3>
                    <button onClick={() => setShowCloudModal(false)} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {!isCloudConnected ? (
                    <>
                        <p className="text-slate-400 text-sm mb-4">
                            Cole o JSON de configuração do seu projeto Firebase para ativar a sincronização em tempo real entre dispositivos.
                        </p>
                        <textarea
                            value={configInput}
                            onChange={(e) => setConfigInput(e.target.value)}
                            placeholder='{"apiKey": "...", "authDomain": "..."}'
                            className="w-full h-40 bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 font-mono mb-4 focus:outline-none focus:border-blue-500"
                        />
                        <button 
                            onClick={handleCloudConfigSubmit}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <Save size={16} /> Conectar Nuvem
                        </button>
                    </>
                ) : (
                    <div className="text-center">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg mb-6">
                            <Cloud size={48} className="text-emerald-400 mx-auto mb-2" />
                            <p className="text-emerald-300 font-bold">Conectado com Sucesso</p>
                            <p className="text-xs text-emerald-500/70 mt-1">Sincronização em tempo real ativa.</p>
                        </div>
                        <button 
                            onClick={handleDisconnectCloud}
                            className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold py-2 rounded-lg transition-colors border border-red-500/30"
                        >
                            Desconectar
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default App;