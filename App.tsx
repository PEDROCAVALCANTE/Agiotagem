import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency, DEFAULT_FIREBASE_CONFIG, getDaysUntilDue, generateWhatsAppLink } from './constants';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { initFirebase, subscribeToClients, saveClientToCloud, syncAllToCloud, isCloudEnabled, FirebaseConfig } from './services/cloudService';
import { LayoutDashboard, Plus, Bell, Cloud, CloudOff, X, Save, Search, AlertTriangle, MessageCircle, ExternalLink, Clock } from 'lucide-react';

const App: React.FC = () => {
  // Cloud Config State - Default to the hardcoded config provided by user
  const [cloudConfig, setCloudConfig] = useState<FirebaseConfig | null>(DEFAULT_FIREBASE_CONFIG);
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [configInput, setConfigInput] = useState(JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2));

  // Settings State - Icon removed, but state kept for logic
  const [warningDays, setWarningDays] = useState<number>(() => {
    const saved = localStorage.getItem('settings_warningDays');
    return saved ? parseInt(saved, 10) : 1;
  });

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
  
  // State to handle navigation from notification to client list
  const [focusTarget, setFocusTarget] = useState<{name: string, timestamp: number} | null>(null);

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

  // Persist LocalStorage (Backup) - Wrapped in try/catch to prevent circular structure crashes
  useEffect(() => {
    try {
      localStorage.setItem('clients', JSON.stringify(clients));
    } catch (e) {
      console.error("LocalStorage Save Error (Circular Structure or Quota):", e);
    }
  }, [clients]);

  // Persist Settings
  useEffect(() => {
    localStorage.setItem('settings_warningDays', warningDays.toString());
  }, [warningDays]);

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
      
      const updated = prevClients.map(client => {
        if (client.isDeleted || client.status === 'Completed') return client;

        const isLate = client.installmentsList.some(inst => !inst.isPaid && getDaysUntilDue(inst.dueDate) < 0);
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
    const alerts: { 
        clientName: string; 
        phone: string;
        installment: number; 
        value: number; 
        dueDate: string; 
        days: number; 
        status: 'overdue' | 'due' 
    }[] = [];

    // CRITICAL FIX: Use ALL non-deleted clients for notifications, not just the search results (activeClients).
    // This ensures notifications persist even when searching for a different user.
    const allNonDeletedClients = clients.filter(c => !c.isDeleted);

    allNonDeletedClients.forEach(client => {
      client.installmentsList?.forEach(inst => {
        if (!inst.isPaid) {
          const days = getDaysUntilDue(inst.dueDate);

          // Update: < 0 is Overdue (Red)
          if (days < 0) {
             alerts.push({ 
                 clientName: client.name, 
                 phone: client.phone, 
                 installment: inst.number, 
                 value: inst.value, 
                 dueDate: inst.dueDate,
                 days: days, 
                 status: 'overdue' 
             });
          } 
          // Update: 0 to warningDays is Due/Warning (Orange)
          // Specifically, this covers Today (0) and Tomorrow (1)
          else if (days >= 0 && days <= warningDays) {
             alerts.push({ 
                 clientName: client.name, 
                 phone: client.phone, 
                 installment: inst.number, 
                 value: inst.value, 
                 dueDate: inst.dueDate,
                 days: days, 
                 status: 'due' 
             });
          }
        }
      });
    });
    
    // Sort: Overdue first, then by date ascending
    return alerts.sort((a, b) => {
        if (a.status === 'overdue' && b.status !== 'overdue') return -1;
        if (b.status === 'overdue' && a.status !== 'overdue') return 1;
        return a.days - b.days;
    });
  }, [clients, warningDays]); // Dependency is 'clients', not 'activeClients'

  const hasOverdueNotifications = useMemo(() => notifications.some(n => n.status === 'overdue'), [notifications]);

  const progressionData = useMemo(() => calculateProgression(activeClients), [activeClients]);

  const financialSummary: FinancialSummary = useMemo(() => {
    // We calculate the summary based on ALL non-deleted clients (Global Portfolio), ignoring the search filter
    const nonDeleted = clients.filter(c => !c.isDeleted);
    
    // Calculate Financials (Total History + Current)
    const totalInvested = nonDeleted.reduce((sum, c) => sum + c.principal, 0);
    const totalRevenueExpected = nonDeleted.reduce((sum, c) => sum + (c.principal * (1 + c.interestRate/100)), 0);
    const totalProfit = nonDeleted.reduce((sum, c) => sum + (c.principal * (1 + c.interestRate/100) - c.principal), 0);

    // Calculate Active Clients (Unique names with at least one active loan)
    const activeNames = new Set<string>();
    nonDeleted.forEach(c => {
        if (c.status !== 'Completed') {
            activeNames.add(c.name.trim().toLowerCase());
        }
    });

    return {
      totalInvested,
      totalRevenueExpected,
      totalProfit,
      activeClients: activeNames.size,
      averageRoi: 0 // Not used in dashboard cards
    };
  }, [clients]);

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

  const handleUpdateClient = (updatedClient: Client) => {
    setClients(prev => {
        const updated = prev.map(c => {
            if (c.id === updatedClient.id) {
                const newClient = { ...updatedClient, lastUpdated: Date.now() };
                if (isCloudConnected) saveClientToCloud(newClient);
                return newClient;
            }
            return c;
        });
        return updated;
    });
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

  // Handle clicking a notification to navigate to the client
  const handleNotificationClick = (clientName: string) => {
    // Clear search so the client is visible in the list
    setSearchQuery('');
    // Trigger focus logic in ClientList
    setFocusTarget({ name: clientName, timestamp: Date.now() });
    setShowNotifications(false);
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
                        <span className={`absolute top-0 right-0 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-pulse ${hasOverdueNotifications ? 'bg-red-500' : 'bg-orange-500'}`}>
                            {notifications.length}
                        </span>
                    )}
                </button>

                {showNotifications && (
                    <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in-down">
                        <div className="p-3 bg-slate-900 border-b border-slate-700 font-bold text-sm text-slate-300 flex items-center justify-between">
                            <span>Cobranças ({notifications.length})</span>
                            {hasOverdueNotifications && <span className="text-[10px] text-red-400 flex items-center gap-1"><AlertTriangle size={10} /> Urgente</span>}
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-sm">Nenhuma pendência urgente.</div>
                            ) : (
                                notifications.map((notif, idx) => {
                                    const isDueToday = notif.days === 0;
                                    const isDueTomorrow = notif.days === 1;
                                    const dueText = isDueToday ? 'Vence Hoje' : (isDueTomorrow ? 'Vence Amanhã' : `Vence em ${notif.days} dias`);
                                    
                                    return (
                                    <div 
                                        key={idx} 
                                        className="p-3 border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors flex items-center justify-between group cursor-pointer"
                                        onClick={() => handleNotificationClick(notif.clientName)}
                                    >
                                        <div className="flex-1">
                                            <p className="font-bold text-white text-sm flex items-center gap-2">
                                                {notif.clientName}
                                                <ExternalLink size={10} className="text-slate-500 group-hover:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity"/>
                                            </p>
                                            <p className="text-xs text-slate-400">Parc. #{notif.installment} - {formatCurrency(notif.value)}</p>
                                        </div>
                                        
                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            {/* WhatsApp Button for Overdue/Today/Tomorrow items */}
                                            {notif.phone && (
                                                <a 
                                                    href={generateWhatsAppLink(notif.phone, notif.clientName, notif.installment, notif.value, notif.dueDate)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500 hover:text-white transition-all"
                                                    title="Cobrar no WhatsApp"
                                                >
                                                    <MessageCircle size={14} />
                                                </a>
                                            )}

                                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${notif.status === 'overdue' ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/20'}`}>
                                                {notif.status === 'overdue' && notif.days < 0 ? 'Vencido' : dueText}
                                            </span>
                                        </div>
                                    </div>
                                )})
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
          onUpdateClient={handleUpdateClient}
          warningDays={warningDays}
          focusTarget={focusTarget}
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