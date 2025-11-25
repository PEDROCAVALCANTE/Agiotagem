import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency } from './constants';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { initFirebase, subscribeToClients, saveClientToCloud, syncAllToCloud, isCloudEnabled, FirebaseConfig } from './services/cloudService';
import { LayoutDashboard, Plus, Loader2, Bell, Cloud, CloudOff, X, Save, AlertTriangle, CheckCircle2, MessageCircle, Phone, ArrowRight } from 'lucide-react';

// Hardcoded configuration provided by the user
const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
    apiKey: "AIzaSyCrsZQpDusua60XLcGXRfBIKb6exrRiP3I",
    authDomain: "giliarde-agi.firebaseapp.com",
    projectId: "giliarde-agi",
    storageBucket: "giliarde-agi.firebasestorage.app",
    messagingSenderId: "1052082323824",
    appId: "1:1052082323824:web:c1acb45f34fc6b8ae44fb5"
};

const App: React.FC = () => {
  // Cloud Config State - Defaults to the hardcoded config if nothing is in localStorage
  const [cloudConfig, setCloudConfig] = useState<FirebaseConfig | null>(() => {
    const saved = localStorage.getItem('firebaseConfig');
    return saved ? JSON.parse(saved) : DEFAULT_FIREBASE_CONFIG;
  });
  
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [configInput, setConfigInput] = useState('');

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

  // Filter out soft-deleted clients for the UI
  const activeClients = useMemo(() => {
    return clients.filter(c => !c.isDeleted).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [clients]);

  const [showForm, setShowForm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
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
                // Simplistic Merge: Cloud overwrites local if connected
                // Ideally we would merge based on lastUpdated, but for this structure
                // we treat the cloud as the single source of truth when connected.
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

  // Overdue Clients Summary for the Dashboard Widget
  const overdueClientsSummary = useMemo(() => {
      const today = new Date();
      today.setHours(0,0,0,0);
      
      return activeClients.map(client => {
          const overdueInstallments = client.installmentsList.filter(i => !i.isPaid && new Date(i.dueDate) < today);
          const totalOverdue = overdueInstallments.reduce((acc, curr) => acc + curr.value, 0);
          
          return {
              ...client,
              totalOverdue,
              overdueCount: overdueInstallments.length
          };
      }).filter(c => c.totalOverdue > 0);
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
        let cleaned = configInput.trim();
        
        // Remove variable declaration (const firebaseConfig =) if present
        if (cleaned.includes('=')) {
            const parts = cleaned.split('=');
            if (parts.length > 1) {
                cleaned = parts[1].trim();
            }
        }
        
        // Remove trailing semicolon
        if (cleaned.endsWith(';')) cleaned = cleaned.slice(0, -1);
        
        // Attempt to fix unquoted keys (JavaScript object syntax to JSON)
        const jsonString = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

        const config = JSON.parse(jsonString);
        
        localStorage.setItem('firebaseConfig', JSON.stringify(config));
        setCloudConfig(config);
        setShowCloudModal(false);
        
        // Attempt to sync current local data to cloud immediately upon connection
        if (activeClients.length > 0) {
             setTimeout(() => {
                 if (isCloudEnabled()) syncAllToCloud(activeClients);
             }, 1000);
        }
    } catch (e) {
        console.error(e);
        alert("Não foi possível ler o código. Certifique-se de copiar o trecho completo que começa com '{' e termina com '}'.");
    }
  };

  const handleDisconnectCloud = () => {
    localStorage.removeItem('firebaseConfig');
    setCloudConfig(null);
    setIsCloudConnected(false);
    window.location.reload(); // Force reload to clear connections
  };

  const handleAddClient = (newClient: Client) => {
    setClients(prev => {
        const updated = [...prev, newClient];
        return updated;
    });
    // Cloud Sync
    if (isCloudConnected) {
        saveClientToCloud(newClient);
    }
    setShowForm(false);
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
                                            {notif.status === 'overdue' ? 'Vencido' : 'Vence Hoje'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button 
              onClick={() => setShowForm(!showForm)}
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

        {/* OVERDUE CLIENTS SECTION */}
        <div className={`bg-slate-800 border ${overdueClientsSummary.length > 0 ? 'border-red-900/50' : 'border-slate-700'} rounded-xl p-6 shadow-lg mb-8 relative overflow-hidden transition-all duration-300`}>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 relative z-10">
                <div className="flex items-center gap-3 mb-4 md:mb-0">
                    <div className={`${overdueClientsSummary.length > 0 ? 'bg-red-500/20 animate-pulse' : 'bg-emerald-500/20'} p-2 rounded-lg`}>
                        {overdueClientsSummary.length > 0 ? <AlertTriangle className="text-red-400" size={24} /> : <CheckCircle2 className="text-emerald-400" size={24} />}
                    </div>
                    <div>
                        <h2 className={`text-xl font-bold ${overdueClientsSummary.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {overdueClientsSummary.length > 0 ? 'Cobrança Imediata' : 'Tudo em Dia'}
                        </h2>
                        <p className="text-slate-400 text-xs">
                            {overdueClientsSummary.length > 0 ? 'Clientes com parcelas vencidas detectados' : 'Nenhuma pendência urgente encontrada'}
                        </p>
                    </div>
                </div>
            </div>

            {overdueClientsSummary.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                    {overdueClientsSummary.map(client => {
                        const cleanPhone = client.phone ? client.phone.replace(/\D/g, '') : '';
                        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
                        
                        // WhatsApp Message Formatting
                        const message = `Olá *${client.name}*, tudo bem? 👋\n\nIdentificamos pendências no valor total de *${formatCurrency(client.totalOverdue)}* no nosso sistema.\n\nPodemos conversar para regularizar?`;
                        const encodedMessage = encodeURIComponent(message);
                        
                        const whatsappLink = cleanPhone ? `https://wa.me/${fullPhone}?text=${encodedMessage}` : '#';

                        return (
                            <div key={client.id} className="bg-red-900/10 border border-red-500/20 rounded-xl p-5 flex flex-col justify-between group hover:bg-red-900/15 transition-colors shadow-sm">
                                <div className="mb-4">
                                    <div className="flex justify-between items-start">
                                        <h4 className="font-bold text-white text-lg">{client.name}</h4>
                                        <div className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">
                                            Atrasado
                                        </div>
                                    </div>
                                    <div className="mt-3 bg-red-950/30 p-3 rounded-lg border border-red-500/10">
                                        <p className="text-xs text-slate-400 mb-1">Total Vencido</p>
                                        <p className="text-2xl font-bold text-red-400">{formatCurrency(client.totalOverdue)}</p>
                                        <p className="text-[10px] text-red-300/70 mt-1 flex items-center gap-1">
                                            <AlertTriangle size={10} /> {client.overdueCount} parcela(s) vencida(s)
                                        </p>
                                    </div>
                                </div>
                                
                                {client.phone ? (
                                    <a 
                                    href={whatsappLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 hover:shadow-emerald-900/40"
                                    title="Enviar mensagem no WhatsApp"
                                    >
                                        <MessageCircle size={18} />
                                        <span>Cobrar via WhatsApp</span>
                                    </a>
                                ) : (
                                    <button disabled className="w-full bg-slate-700 text-slate-500 font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-not-allowed">
                                        <Phone size={18} /> Sem Telefone
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-emerald-900/10 border border-emerald-500/10 rounded-lg p-6 text-center relative z-10">
                    <p className="text-emerald-300 font-medium">Parabéns! Sua carteira de clientes está saudável.</p>
                </div>
            )}
        </div>

        {/* Chart Section */}
        <ChartSection data={progressionData} />

        {/* Client Form */}
        {showForm && (
          <ClientForm onAddClient={handleAddClient} onCancel={() => setShowForm(false)} />
        )}

        {/* Client List Header */}
        <div className="flex items-center gap-3 mb-4 pl-1 border-l-4 border-emerald-500">
            <h2 className="text-xl font-bold text-white">Carteira de Clientes</h2>
        </div>

        {/* Client List */}
        <ClientList 
          clients={activeClients} 
          onDelete={handleDeleteClient}
          onTogglePayment={handleTogglePayment}
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
                            Cole o código do Firebase <b>exatamente como copiou do site</b> (com 'const config = ...' ou apenas as chaves). O sistema ajusta automaticamente.
                        </p>
                        <textarea
                            value={configInput}
                            onChange={(e) => setConfigInput(e.target.value)}
                            placeholder='Cole o código aqui...'
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