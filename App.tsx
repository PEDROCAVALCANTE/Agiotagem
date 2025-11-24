import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Client, FinancialSummary } from './types';
import { calculateProgression, formatCurrency } from './constants';
import { analyzePortfolio } from './services/aiService';
import { DashboardCards } from './components/DashboardCards';
import { ChartSection } from './components/ChartSection';
import { ClientForm } from './components/ClientForm';
import { ClientList } from './components/ClientList';
import { LayoutDashboard, Plus, BrainCircuit, Loader2, Bell, CheckCircle, Database, Download, Upload, Copy, Smartphone, X, Merge, RefreshCw, Share2, Link } from 'lucide-react';

const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(() => {
    const saved = localStorage.getItem('clients');
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            // Migration: Ensure all clients have a timestamp for sync logic
            return parsed.map((c: any) => ({
                ...c,
                status: c.status || 'Active',
                lastUpdated: c.lastUpdated || Date.now(), // Backfill timestamp if missing
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
  const [showSettings, setShowSettings] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncText, setSyncText] = useState('');
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

  // URL Sync Check on Mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const syncData = params.get('sync');
    if (syncData) {
        try {
            const decoded = atob(syncData);
            setSyncText(decoded);
            setShowSyncModal(true);
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Invalid sync link", e);
            alert("O link de sincronização é inválido ou está corrompido.");
        }
    }
  }, []);

  // Status check on mount: Update 'Late' status based on current date
  useEffect(() => {
    setClients(prevClients => {
      let hasChanges = false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const updated = prevClients.map(client => {
        if (client.isDeleted || client.status === 'Completed') return client;

        // Check if any unpaid installment is overdue
        const isLate = client.installmentsList.some(inst => !inst.isPaid && new Date(inst.dueDate) < today);
        const newStatus = isLate ? 'Late' : 'Active';

        if (client.status !== newStatus) {
          hasChanges = true;
          return { ...client, status: newStatus };
        }
        return client;
      });

      return hasChanges ? updated : prevClients;
    });
  }, []);

  // Notification Logic
  const notifications = useMemo(() => {
    const alerts: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only check active clients
    activeClients.forEach(client => {
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
  }, [activeClients]);

  const addClient = (client: Client) => {
    setClients([client, ...clients]);
    setShowForm(false);
    setAiInsight('');
  };

  const removeClient = (id: string) => {
    if(window.confirm('Tem certeza que deseja remover este cliente?')) {
      // Soft Delete: Mark as deleted and update timestamp
      setClients(prevClients => prevClients.map(c => 
        c.id === id 
        ? { ...c, isDeleted: true, lastUpdated: Date.now() } 
        : c
      ));
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

      // Recalculate Status
      let newStatus: 'Active' | 'Completed' | 'Late' = 'Active';
      const allPaid = updatedInstallments.every(i => i.isPaid);
      
      if (allPaid) {
        newStatus = 'Completed';
      } else {
        const today = new Date();
        today.setHours(0,0,0,0);
        const hasOverdue = updatedInstallments.some(i => !i.isPaid && new Date(i.dueDate) < today);
        if (hasOverdue) newStatus = 'Late';
      }

      return {
        ...client,
        installmentsList: updatedInstallments,
        status: newStatus,
        lastUpdated: Date.now() // Update timestamp on payment change
      };
    }));
  };

  // --- Data Persistence Handlers ---

  // 1. File Export
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

  // 2. File Import - Reads file and opens modal for decision
  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        // Validate JSON simply
        JSON.parse(content); 
        setSyncText(content);
        setShowSyncModal(true);
        setShowSettings(false);
      } catch (err) {
        console.error(err);
        alert('O arquivo selecionado não é um backup válido (JSON corrompido).');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  // 3. Clipboard Copy
  const handleCopyData = () => {
    const dataStr = JSON.stringify(clients);
    navigator.clipboard.writeText(dataStr).then(() => {
      alert('Dados copiados! Envie para o seu outro dispositivo (WhatsApp, E-mail, etc) e use a opção "Colar Dados".');
      setShowSettings(false);
    });
  };

  // 4. Generate Share Link
  const handleShareLink = () => {
      const dataStr = JSON.stringify(clients);
      const encoded = btoa(dataStr);
      
      // Warn if data is too big for URL
      if (encoded.length > 5000) {
          alert("Seus dados são muito grandes para gerar um link direto (Limite do navegador). Por favor, use a opção 'Copiar Código' ou 'Baixar Backup'.");
          return;
      }

      const url = `${window.location.origin}${window.location.pathname}?sync=${encoded}`;
      
      navigator.clipboard.writeText(url).then(() => {
        alert('Link de Sincronização copiado!\n\nEnvie este link para seu celular/computador. Ao clicar nele, os dados serão importados automaticamente.');
        setShowSettings(false);
      });
  };

  // 5. Open Paste Modal
  const handleOpenSyncModal = () => {
    setSyncText('');
    setShowSyncModal(true);
    setShowSettings(false);
  }

  // Common Processing Logic (Merge vs Replace)
  const processImportedData = (jsonString: string, mode: 'merge' | 'replace') => {
      try {
        const parsed = JSON.parse(jsonString);
        
        if (Array.isArray(parsed)) {
           const importedClients = parsed as Client[];

           if (mode === 'replace') {
               if(window.confirm(`ATENÇÃO: Isso APAGARÁ todos os dados atuais e restaurará os dados importados (${importedClients.length} clientes).\n\nOs dados atuais serão perdidos. Deseja continuar?`)) {
                  setClients(importedClients);
                  setShowSyncModal(false);
                  alert('Dados substituídos com sucesso!');
               }
           } else {
               // MERGE LOGIC WITH TIMESTAMP AND SOFT DELETE
               // Ensure current clients have valid timestamps for comparison
               const currentMap = new Map(clients.map(c => [c.id, { ...c, lastUpdated: c.lastUpdated || 0 }] as [string, Client]));
               
               let addedCount = 0;
               let updatedCount = 0;

               importedClients.forEach((importedClient: Client) => {
                   const localClient = currentMap.get(importedClient.id);
                   const importedTime = importedClient.lastUpdated || 0;

                   if (localClient) {
                       const localTime = localClient.lastUpdated || 0;

                       // If imported data is newer, overwrite local
                       if (importedTime > localTime) {
                           currentMap.set(importedClient.id, importedClient);
                           updatedCount++;
                       }
                       // If local is newer, do nothing (keep local)
                   } else {
                       // New client (doesn't exist locally)
                       currentMap.set(importedClient.id, importedClient);
                       addedCount++;
                   }
               });

               const mergedList = Array.from(currentMap.values());
               
               setClients(mergedList);
               setShowSyncModal(false);
               alert(`Sincronização Concluída!\n\nRegistros novos/atualizados: ${addedCount + updatedCount}\n\nAgora seus dispositivos devem estar iguais.`);
           }
        } else {
          alert('Dados inválidos. Certifique-se de copiar o código gerado pelo Giliarde AGI.');
        }
      } catch (err) {
        console.error(err);
        alert('Erro ao processar dados. O formato está incorreto.');
      }
  };

  const summary: FinancialSummary = useMemo(() => {
    const totalInvested = activeClients.reduce((sum, c) => sum + c.principal, 0);
    const totalRevenueExpected = activeClients.reduce((sum, c) => sum + (c.principal * (1 + c.interestRate / 100)), 0);
    const totalProfit = totalRevenueExpected - totalInvested;
    
    return {
      totalInvested,
      totalRevenueExpected,
      totalProfit,
      activeClients: activeClients.length,
      averageRoi: activeClients.length ? (totalProfit / totalInvested) * 100 : 0
    };
  }, [activeClients]);

  const progressionData = useMemo(() => calculateProgression(activeClients), [activeClients]);

  const handleAiAnalysis = async () => {
    if (activeClients.length === 0) return;
    setIsAnalyzing(true);
    const result = await analyzePortfolio(activeClients);
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
                    className={`p-2 rounded-lg transition-all flex items-center gap-2 ${showSettings ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'}`}
                    title="Banco de Dados / Sincronização"
                >
                    <RefreshCw size={20} />
                    <span className="hidden md:inline text-sm font-bold">Sincronizar</span>
                </button>

                {showSettings && (
                    <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in p-2">
                        <div className="text-xs font-bold text-slate-500 uppercase px-2 py-1 mb-1">Transferência Rápida</div>
                        
                        <button 
                            onClick={handleShareLink}
                            className="w-full text-left flex items-center gap-3 px-3 py-3 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-lg transition-colors font-bold mb-2"
                        >
                            <Link size={16} />
                            <span>Copiar Link de Sincronização</span>
                        </button>
                        <p className="text-[10px] text-slate-500 px-3 mb-2 leading-tight">Envie este link para seu outro dispositivo e abra-o para mesclar os dados automaticamente.</p>

                        <div className="my-2 border-t border-slate-800"></div>

                        <button 
                            onClick={handleCopyData}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                        >
                            <Copy size={16} className="text-slate-400" />
                            <span>Copiar Código</span>
                        </button>

                        <button 
                            onClick={handleOpenSyncModal}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                        >
                            <Smartphone size={16} className="text-slate-400" />
                            <span>Colar Código Manualmente</span>
                        </button>

                        <div className="my-2 border-t border-slate-800"></div>
                        <div className="text-xs font-bold text-slate-500 uppercase px-2 py-1 mb-1">Arquivo</div>
                        
                        <button 
                            onClick={handleExportData}
                            className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
                        >
                            <Download size={16} className="text-slate-400" />
                            <span>Baixar Backup .json</span>
                        </button>
                        
                        <label className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-lg transition-colors cursor-pointer relative">
                            <Upload size={16} className="text-slate-400" />
                            <span>Restaurar Backup .json</span>
                            <input 
                                type="file" 
                                accept=".json" 
                                onChange={handleImportData}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </label>
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
        
        {/* Sync Modal */}
        {showSyncModal && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
             <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-lg w-full shadow-2xl animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                   <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Smartphone size={20} className="text-blue-400" /> Sincronizar Dados
                   </h3>
                   <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:text-white">
                      <X size={20} />
                   </button>
                </div>
                <p className="text-sm text-slate-400 mb-4">
                   Dados detectados! O que você deseja fazer com os clientes recebidos?
                </p>
                <textarea 
                  className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono focus:border-blue-500 focus:outline-none resize-none mb-4"
                  placeholder='O código aparecerá aqui...'
                  value={syncText}
                  onChange={(e) => setSyncText(e.target.value)}
                ></textarea>
                
                <div className="grid grid-cols-2 gap-4">
                    <button 
                       onClick={() => processImportedData(syncText, 'merge')}
                       disabled={!syncText}
                       className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-bold flex flex-col items-center justify-center gap-1 transition-all"
                    >
                       <div className="flex items-center gap-2"><Merge size={18} /> Mesclar (Juntar)</div>
                       <span className="text-[10px] opacity-80 font-normal">Soma os dados (Desktop + Mobile)</span>
                    </button>

                    <button 
                       onClick={() => processImportedData(syncText, 'replace')}
                       disabled={!syncText}
                       className="bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-3 rounded-lg text-sm font-bold flex flex-col items-center justify-center gap-1 transition-all"
                    >
                       <div className="flex items-center gap-2"><RefreshCw size={18} /> Substituir Tudo</div>
                        <span className="text-[10px] opacity-80 font-normal">Apaga atual e usa o novo</span>
                    </button>
                </div>
             </div>
          </div>
        )}

        {/* KPI Section */}
        <DashboardCards summary={summary} />

        {/* Form Section */}
        {showForm && (
          <ClientForm onAddClient={addClient} onCancel={() => setShowForm(false)} />
        )}

        {/* Charts Section */}
        {activeClients.length > 0 && (
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
                  disabled={isAnalyzing || activeClients.length === 0}
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
              
              {activeClients.length > 0 && (
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
            clients={activeClients} 
            onDelete={removeClient} 
            onTogglePayment={handleTogglePayment}
          />
        </div>

      </main>
    </div>
  );
};

export default App;