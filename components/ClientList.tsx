
import React, { useState, useMemo } from 'react';
import { Client, Installment } from '../types';
import { formatCurrency } from '../constants';
import { Phone, User, Calendar, Trash2, ChevronDown, ChevronUp, CheckCircle, TrendingUp, AlertTriangle, CheckSquare, ShieldCheck, Layers, Pencil, Check, X, FileText } from 'lucide-react';

interface ClientListProps {
  clients: Client[];
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
  onEditName: (oldName: string, newName: string) => void;
  onEditLoan: (client: Client) => void;
}

interface GroupedClient {
  name: string;
  phone: string;
  clients: Client[]; // Array of loans for this person
  totalPrincipal: number;
  totalReturn: number;
  totalProfit: number;
  overallStatus: 'Active' | 'Completed' | 'Late';
  hasOverdue: boolean;
  hasObservation: boolean;
  earliestStartDate: string;
}

interface ClientGroupProps {
  title: string;
  groupedClients: GroupedClient[];
  colorTheme: 'red' | 'emerald' | 'blue';
  icon: React.ElementType;
  expandedName: string | null;
  onExpand: (name: string) => void;
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
  onEditName: (oldName: string, newName: string) => void;
  onEditLoan: (client: Client) => void;
}

// Helper to determine color of individual installments
const getInstallmentStatusColor = (installment: Installment) => {
  if (installment.isPaid) return 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [y, m, d] = installment.dueDate.split('-').map(Number);
  const dueDate = new Date(y, m - 1, d);
  
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'bg-red-500/10 border-red-500/50 text-red-400'; // Overdue
  if (diffDays <= 1) return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'; // Due soon
  
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

const ClientGroupSection: React.FC<ClientGroupProps> = ({ 
  title, groupedClients, colorTheme, icon: Icon, expandedName, onExpand, onDelete, onTogglePayment, onEditName, onEditLoan
}) => {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  const themeClasses = {
    red: { border: 'border-red-500/30', bg: 'bg-red-500/5', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' },
    emerald: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' },
    blue: { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' }
  };

  const theme = themeClasses[colorTheme];
  const isRedTheme = colorTheme === 'red';

  const startEditing = (e: React.MouseEvent, name: string) => {
      e.stopPropagation();
      setEditingName(name);
      setTempName(name);
  };

  const saveName = (e: React.MouseEvent, oldName: string) => {
      e.stopPropagation();
      onEditName(oldName, tempName);
      setEditingName(null);
  };

  const cancelEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingName(null);
  };

  return (
    <div className={`rounded-xl border ${theme.border} overflow-hidden mb-6 shadow-lg`}>
      <div className={`${theme.bg} px-6 py-3 border-b ${theme.border} flex items-center gap-3`}>
        <Icon className={theme.text} size={20} />
        <h3 className={`font-bold uppercase text-sm ${theme.text} tracking-wider`}>{title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.badge} border ${theme.border}`}>
          {groupedClients.length}
        </span>
      </div>

      <div className="overflow-x-auto bg-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900/50 text-slate-400 uppercase font-bold text-xs">
            <tr>
              <th className="px-6 py-3">Cliente</th>
              <th className="px-6 py-3">Contratos</th>
              <th className="px-6 py-3">Total Principal</th>
              <th className="px-6 py-3">Progresso Geral</th>
              <th className="px-6 py-3">Retorno Total</th>
              <th className="px-6 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {groupedClients.map((group) => {
              const isExpanded = expandedName === group.name;
              
              // Calculate aggregated progress
              let totalInstallments = 0;
              let totalPaid = 0;
              group.clients.forEach(c => {
                  totalInstallments += c.installments;
                  totalPaid += (c.installmentsList?.filter(i => i.isPaid).length || 0);
              });
              const progress = totalInstallments > 0 ? (totalPaid / totalInstallments) * 100 : 0;

              // Pulse if specifically in red theme or generally detected as overdue
              const shouldPulse = isRedTheme || group.hasOverdue;

              const rowClass = shouldPulse 
                ? `animate-pulse-red` 
                : `${isExpanded ? 'bg-slate-700/30' : 'hover:bg-slate-700/10'}`;

              return (
                <React.Fragment key={group.name}>
                  <tr className={`transition-colors border-b border-slate-700/50 ${rowClass}`}>
                    <td className="px-6 py-4 cursor-pointer" onClick={() => onExpand(group.name)}>
                      <div className="flex flex-col">
                        <span className="font-medium text-white flex items-center gap-2 group">
                          <User size={14} className={shouldPulse ? "text-red-400" : "text-slate-400"}/> 
                          
                          {editingName === group.name ? (
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                      type="text" 
                                      value={tempName}
                                      onChange={(e) => setTempName(e.target.value)}
                                      className="bg-slate-900 border border-emerald-500 rounded px-2 py-0.5 text-white text-sm focus:outline-none w-32 md:w-48"
                                      autoFocus
                                  />
                                  <button onClick={(e) => saveName(e, group.name)} className="text-emerald-400 hover:bg-emerald-500/20 p-1 rounded">
                                      <Check size={14} />
                                  </button>
                                  <button onClick={cancelEditing} className="text-red-400 hover:bg-red-500/20 p-1 rounded">
                                      <X size={14} />
                                  </button>
                              </div>
                          ) : (
                              <>
                                {group.name}
                                <button 
                                  onClick={(e) => startEditing(e, group.name)}
                                  className="text-slate-600 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                  title="Editar nome"
                                >
                                    <Pencil size={12} />
                                </button>
                              </>
                          )}

                          {group.hasObservation && !editingName && (
                              <span title="Possui observações" className="text-slate-400 bg-slate-700/50 p-0.5 rounded">
                                  <FileText size={10} />
                              </span>
                          )}

                          {shouldPulse && !editingName && (
                              <span className="relative flex h-2 w-2 ml-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>
                          )}
                        </span>
                        {group.phone && (
                          <span className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                            <Phone size={12} /> {group.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="flex items-center gap-1 text-xs font-mono bg-slate-700/50 px-2 py-1 rounded text-slate-300 w-fit">
                          <Layers size={12} /> {group.clients.length} {group.clients.length === 1 ? 'Empréstimo' : 'Empréstimos'}
                       </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono">
                      {formatCurrency(group.totalPrincipal)}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 w-24">
                          <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                             <div className={`h-full transition-all duration-500 ${colorTheme === 'blue' ? 'bg-blue-500' : shouldPulse ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${progress}%` }}></div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{totalPaid}/{totalInstallments}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                          <span className="text-white font-bold font-mono text-xs">
                              {formatCurrency(group.totalReturn)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                              Lucro Total: +{formatCurrency(group.totalProfit)}
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                            onClick={() => onExpand(group.name)}
                            className="text-slate-500 hover:text-white p-1.5 rounded hover:bg-slate-700"
                        >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                      <tr className={`${shouldPulse ? 'bg-red-900/10' : 'bg-slate-900/40'} shadow-inner`}>
                          <td colSpan={6} className="p-4">
                            {/* Render Each Loan Separately */}
                            <div className="space-y-6">
                                {group.clients.map((loan, idx) => {
                                    const loanTotalReturn = loan.principal * (1 + loan.interestRate / 100);
                                    const loanProfit = loanTotalReturn - loan.principal;
                                    
                                    return (
                                        <div key={loan.id} className="bg-slate-900 rounded-xl border border-slate-700/50 overflow-hidden">
                                            {/* Loan Header */}
                                            <div className="bg-slate-800/50 px-4 py-3 border-b border-slate-700/50 flex flex-wrap justify-between items-center gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-slate-700 p-1.5 rounded text-slate-300 font-bold text-xs">
                                                        #{idx + 1}
                                                    </div>
                                                    <div>
                                                        <div className="text-xs text-slate-400">Data do Empréstimo</div>
                                                        <div className="text-sm font-bold text-white flex items-center gap-1">
                                                            <Calendar size={14} className="text-emerald-500" />
                                                            {loan.startDate.split('-').reverse().join('/')}
                                                        </div>
                                                    </div>
                                                    <div className="h-6 w-px bg-slate-700 mx-2"></div>
                                                    <div>
                                                        <div className="text-xs text-slate-400">Valor Tomado</div>
                                                        <div className="text-sm font-bold text-white">{formatCurrency(loan.principal)}</div>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => onEditLoan(loan)}
                                                        className="text-slate-500 hover:text-blue-400 text-xs flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                                                    >
                                                        <Pencil size={14} /> Editar
                                                    </button>
                                                    <div className="h-4 w-px bg-slate-700"></div>
                                                    <button 
                                                        onClick={() => onDelete(loan.id)}
                                                        className="text-slate-500 hover:text-red-400 text-xs flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded transition-colors"
                                                    >
                                                        <Trash2 size={14} /> Excluir
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Observations Section */}
                                            {loan.observation && (
                                                <div className="px-4 py-2 bg-slate-800/20 border-b border-slate-700/30 flex items-start gap-2">
                                                    <FileText size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                                                    <p className="text-xs text-slate-300 italic break-words">
                                                        "{loan.observation}"
                                                    </p>
                                                </div>
                                            )}

                                            {/* Installments Grid */}
                                            <div className="p-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                    {loan.installmentsList?.map((inst) => {
                                                        const statusColor = getInstallmentStatusColor(inst);
                                                        const statusText = getStatusText(inst);
                                                        const displayDate = inst.dueDate.split('-').reverse().join('/');

                                                        return (
                                                            <div key={inst.number} className={`border rounded-lg p-3 transition-all relative ${statusColor}`}>
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <span className="font-mono font-bold text-sm opacity-70"> Parc. {inst.number}</span>
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
                                                                        onClick={() => onTogglePayment(loan.id, inst.number)}
                                                                        className={`p-1.5 rounded-full transition-all ${inst.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                                                    >
                                                                        <CheckCircle size={18} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Loan Profit Summary */}
                                                    <div className="border rounded-lg p-3 transition-all bg-purple-900/10 border-purple-500/20 text-purple-300 relative overflow-hidden flex flex-col justify-between">
                                                        <div className="flex justify-between items-start">
                                                            <span className="font-mono font-bold text-sm text-purple-500">RESUMO</span>
                                                            <TrendingUp size={16} className="text-purple-500/50" />
                                                        </div>
                                                        <div>
                                                            <div className="text-[10px] opacity-60 text-purple-400">Lucro do Contrato</div>
                                                            <div className="font-bold text-base mt-0.5 text-purple-300">{formatCurrency(loanProfit)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
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

export const ClientList: React.FC<ClientListProps> = ({ clients, onDelete, onTogglePayment, onEditName, onEditLoan }) => {
  const [expandedClientName, setExpandedClientName] = useState<string | null>(null);

  const toggleExpand = (name: string) => {
    setExpandedClientName(expandedClientName === name ? null : name);
  };

  // Group clients by Name
  const groupedClients = useMemo(() => {
      const groups: Record<string, GroupedClient> = {};

      clients.forEach(client => {
          const key = client.name.trim(); // Normalize name
          
          if (!groups[key]) {
              groups[key] = {
                  name: key,
                  phone: client.phone,
                  clients: [],
                  totalPrincipal: 0,
                  totalReturn: 0,
                  totalProfit: 0,
                  overallStatus: 'Active',
                  hasOverdue: false,
                  hasObservation: false,
                  earliestStartDate: client.startDate
              };
          }

          const totalReturn = client.principal * (1 + client.interestRate / 100);
          const profit = totalReturn - client.principal;

          // Check for overdue
          const today = new Date();
          today.setHours(0,0,0,0);
          const isLate = client.installmentsList.some(i => !i.isPaid && new Date(i.dueDate) < today);

          groups[key].clients.push(client);
          groups[key].totalPrincipal += client.principal;
          groups[key].totalReturn += totalReturn;
          groups[key].totalProfit += profit;
          if (isLate) groups[key].hasOverdue = true;
          if (client.observation && client.observation.trim().length > 0) groups[key].hasObservation = true;
          
          // Update phone if missing in group but present in current
          if (!groups[key].phone && client.phone) groups[key].phone = client.phone;
          
          // Keep earliest date
          if (new Date(client.startDate) < new Date(groups[key].earliestStartDate)) {
              groups[key].earliestStartDate = client.startDate;
          }
      });

      // Determine overall status for the group
      Object.values(groups).forEach(group => {
          if (group.hasOverdue) {
              group.overallStatus = 'Late';
          } else {
              const allCompleted = group.clients.every(c => c.status === 'Completed');
              group.overallStatus = allCompleted ? 'Completed' : 'Active';
          }
      });

      return Object.values(groups);
  }, [clients]);

  const lateGroups = groupedClients.filter(g => g.overallStatus === 'Late');
  const activeGroups = groupedClients.filter(g => g.overallStatus === 'Active');
  const completedGroups = groupedClients.filter(g => g.overallStatus === 'Completed');

  if (clients.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 border border-slate-700/50 rounded-xl border-dashed">
        <p className="text-slate-400">Nenhum cliente registrado na carteira.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lateGroups.length > 0 && (
        <ClientGroupSection 
          title="Atenção Necessária (Atrasados)" 
          groupedClients={lateGroups} 
          colorTheme="red" 
          icon={AlertTriangle}
          expandedName={expandedClientName}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
          onEditName={onEditName}
          onEditLoan={onEditLoan}
        />
      )}

      {activeGroups.length > 0 && (
        <ClientGroupSection 
          title="Carteira Ativa (Em Dia)" 
          groupedClients={activeGroups} 
          colorTheme="emerald" 
          icon={ShieldCheck}
          expandedName={expandedClientName}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
          onEditName={onEditName}
          onEditLoan={onEditLoan}
        />
      )}

      {completedGroups.length > 0 && (
        <ClientGroupSection 
          title="Histórico (Finalizados)" 
          groupedClients={completedGroups} 
          colorTheme="blue" 
          icon={CheckSquare}
          expandedName={expandedClientName}
          onExpand={toggleExpand}
          onDelete={onDelete}
          onTogglePayment={onTogglePayment}
          onEditName={onEditName}
          onEditLoan={onEditLoan}
        />
      )}
    </div>
  );
};
