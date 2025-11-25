import React, { useState } from 'react';
import { Client, Installment } from '../types';
import { formatCurrency } from '../constants';
import { Phone, User, Calendar, Trash2, ChevronDown, ChevronUp, CheckCircle, TrendingUp, AlertTriangle, CheckSquare, ShieldCheck } from 'lucide-react';

interface ClientListProps {
  clients: Client[];
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
}

interface ClientGroupProps {
  title: string;
  clients: Client[];
  colorTheme: 'red' | 'emerald' | 'blue';
  icon: React.ElementType;
  expandedId: string | null;
  onExpand: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
}

const getInstallmentStatusColor = (installment: Installment) => {
  if (installment.isPaid) return 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Robust Date Parsing
  const [y, m, d] = installment.dueDate.split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  
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
  
  const [y, m, d] = installment.dueDate.split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'VENCIDO';
  if (diffDays === 0) return 'HOJE';
  if (diffDays === 1) return 'AMANHÃ';
  
  return 'ABERTO';
}

// Sub-component for rendering a table section
const ClientGroupSection: React.FC<ClientGroupProps> = ({ 
  title, clients, colorTheme, icon: Icon, expandedId, onExpand, onDelete, onTogglePayment 
}) => {
  
  const themeClasses = {
    red: { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' },
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
    blue: { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' }
  };

  const theme = themeClasses[colorTheme];
  const isRedTheme = colorTheme === 'red';

  return (
    <div className={`rounded-xl border ${theme.border} overflow-hidden mb-6 shadow-lg`}>
      <div className={`${theme.bg} px-6 py-3 border-b ${theme.border} flex items-center gap-3`}>
        <Icon className={theme.text} size={20} />
        <h3 className={`font-bold uppercase text-sm ${theme.text} tracking-wider`}>{title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.badge} border ${theme.border}`}>
          {clients.length}
        </span>
      </div>

      <div className="overflow-x-auto bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/50 text-slate-400 uppercase font-bold text-xs">
            <tr>
              <th className="px-6 py-3">Cliente</th>
              <th className="px-6 py-3">Início</th>
              <th className="px-6 py-3">Principal</th>
              <th className="px-6 py-3">Progresso</th>
              <th className="px-6 py-3">Retorno</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {clients.map((client) => {
              const totalReturn = client.principal * (1 + client.interestRate / 100);
              const dateFormatted = client.startDate.split('-').reverse().join('/');
              const isExpanded = expandedId === client.id;
              
              const paidCount = client.installmentsList ? client.installmentsList.filter(i => i.isPaid).length : 0;
              const progress = (paidCount / client.installments) * 100;
              const totalProfit = totalReturn - client.principal;

              // Check dynamically if client has any overdue installments
              // This ensures visual sync even if status update is pending or if viewing in a different list
              const hasOverdue = client.installmentsList?.some(i => {
                  if (i.isPaid) return false;
                  const [y, m, d] = i.dueDate.split('-').map(Number);
                  const dueDate = new Date(y, m - 1, d);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return dueDate < today;
              });

              // Apply special highlighting for late clients (red theme) or dynamically detected overdue
              const shouldPulse = isRedTheme || hasOverdue;

              const rowClass = shouldPulse 
                ? `animate-pulse-red` 
                : `${isExpanded ? 'bg-slate-700/30' : 'hover:bg-slate-700/10'}`;

              return (
                <React.Fragment key={client.id}>
                  <tr className={`transition-colors border-b border-slate-700/50 ${rowClass}`}>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => onExpand(client.id)}>
                      <div className="flex flex-col">
                        <span className="font-medium text-white flex items-center gap-2">
                          <User size={14} className={shouldPulse ? "text-red-400" : "text-slate-400"}/> 
                          {client.name}
                          {shouldPulse && (
                              <span className="relative flex h-2 w-2 ml-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                          )}
                        </span>
                        {client.phone && (
                          <span className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                            <Phone size={12} /> {client.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                      {dateFormatted}
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono">
                      {formatCurrency(client.principal)}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                             <div className={`h-full transition-all duration-500 ${colorTheme === 'blue' ? 'bg-blue-500' : shouldPulse ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }}></div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{paidCount}/{client.installments}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                          <span className="text-white font-bold font-mono text-xs">
                              {formatCurrency(totalReturn)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                              Lucro: +{client.interestRate.toFixed(1)}%
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                            onClick={() => onExpand(client.id)}
                            className="text-slate-500 hover:text-white p-1.5 rounded hover:bg-slate-700"
                        >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <button 
                          onClick={() => onDelete(client.id)}
                          className="text-slate-600 hover:text-red-400 transition-colors p-1.5 rounded hover:bg-slate-700"
                          title="Remover Cliente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                      <tr className={`${shouldPulse ? 'bg-red-900/10' : 'bg-slate-900/40'} shadow-inner`}>
                          <td colSpan={6} className="p-4">
                            <div className="bg-slate-900 rounded-xl p-4 border border-slate-700/50">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                                    <Calendar size={14} /> Cronograma de Pagamentos
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {client.installmentsList?.map((inst) => {
                                        const statusColor = getInstallmentStatusColor(inst);
                                        const statusText = getStatusText(inst);
                                        const displayDate = inst.dueDate.split('-').reverse().join('/');

                                        return (
                                            <div key={inst.number} className={`border rounded-lg p-3 transition-all relative ${statusColor}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-mono font-bold text-sm opacity-70">#{inst.number}</span>
                                                    <div className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 uppercase">
                                                        {statusText}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <div className="text-[10px] opacity-60">Vencimento</div>
                                                        <div className="font-mono text-xs">{displayDate}</div>
                                                        <div className="font-bold text-base mt-0.5">{formatCurrency(inst.value)}</div>
                                                    </div>
                                                    <button 
                                                        onClick={() => onTogglePayment(client.id, inst.number)}
                                                        className={`p-1.5 rounded-full transition-all ${inst.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                                    >
                                                        <CheckCircle size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Profit Card */}
                                    <div className="border rounded-lg p-3 transition-all bg-purple-900/10 border-purple-500/20 text-purple-300 relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-mono font-bold text-sm text-purple-500">RESUMO</span>
                                            <div className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/30 uppercase text-purple-300">
                                                LUCRO
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end mt-4">
                                            <div>
                                                <div className="text-[10px] opacity-60 text-purple-400">Total Ganho</div>
                                                <div className="font-bold text-base mt-0.5 text-purple-300">{formatCurrency(totalProfit)}</div>
                                            </div>
                                            <TrendingUp size={18} className="text-purple-500/50" />
                                        </div>
                                    </div>
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

export const ClientList: React.FC<ClientListProps> = ({ clients, onDelete, onTogglePayment }) => {
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedClientId(expandedClientId === id ? null : id);
  };

  const lateClients = clients.filter(c => c.status === 'Late');
  const activeClients = clients.filter(c => c.status === 'Active');
  const completedClients = clients.filter(c => c.status === 'Completed');

  if (clients.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 border border-slate-700/50 rounded-xl border-dashed">
        <p className="text-slate-400">Nenhum cliente registrado na carteira.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lateClients.length > 0 && (
        <ClientGroupSection 
          title="Atenção Necessária (Atrasados)" 
          clients={lateClients} 
          colorTheme="red" 
          icon={AlertTriangle}
          expandedId={expandedClientId}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
        />
      )}

      {activeClients.length > 0 && (
        <ClientGroupSection 
          title="Carteira Ativa (Em Dia)" 
          clients={activeClients} 
          colorTheme="emerald" 
          icon={ShieldCheck}
          expandedId={expandedClientId}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
        />
      )}

      {completedClients.length > 0 && (
        <ClientGroupSection 
          title="Histórico (Finalizados)" 
          clients={completedClients} 
          colorTheme="blue" 
          icon={CheckSquare}
          expandedId={expandedClientId}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
        />
      )}
    </div>
  );
};