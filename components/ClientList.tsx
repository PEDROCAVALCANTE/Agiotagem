import React, { useState, useMemo, useEffect } from 'react';
import { Client, Installment } from '../types';
import { formatCurrency, getDaysUntilDue, generateWhatsAppLink } from '../constants';
import { Phone, User, Calendar, Trash2, ChevronDown, ChevronUp, CheckCircle, TrendingUp, Copy, Layers, AlertTriangle, StickyNote, MessageCircle, Clock } from 'lucide-react';

interface ClientListProps {
  clients: Client[];
  onDelete: (id: string) => void;
  onTogglePayment: (clientId: string, installmentNumber: number) => void;
  onDuplicate: (client: Client) => void;
  onUpdateAnnotation: (id: string, note: string) => void;
  warningDays: number;
  focusTarget?: { name: string, timestamp: number } | null;
}

interface GroupedClient {
  name: string;
  phone: string;
  loans: Client[];
  totalPrincipal: number;
  totalReturn: number;
  totalProfit: number;
  overallStatus: 'Active' | 'Completed' | 'Late' | 'Warning';
  earliestDate: string;
  totalPaidCount: number;
  totalInstallmentCount: number;
}

export const ClientList: React.FC<ClientListProps> = ({ clients, onDelete, onTogglePayment, onDuplicate, onUpdateAnnotation, warningDays, focusTarget }) => {
  // Use Name as the key for expansion since we are grouping by name
  const [expandedClientName, setExpandedClientName] = useState<string | null>(null);

  const toggleExpand = (name: string) => {
    setExpandedClientName(expandedClientName === name ? null : name);
  };

  // Group clients by Name
  const groupedClients = useMemo(() => {
    const groups: Record<string, GroupedClient> = {};

    clients.forEach(client => {
      // Use lower case for key to unify 'Joao' and 'joao'
      const key = client.name.trim().toLowerCase();
      
      if (!groups[key]) {
        groups[key] = {
          name: client.name, // Display the first name found (preserves casing of first entry)
          phone: client.phone,
          loans: [],
          totalPrincipal: 0,
          totalReturn: 0,
          totalProfit: 0,
          overallStatus: 'Completed', // Start with Completed, downgrade based on finding
          earliestDate: client.startDate,
          totalPaidCount: 0,
          totalInstallmentCount: 0
        };
      }

      const g = groups[key];
      g.loans.push(client);
      
      // Accumulate Financials
      const clientReturn = client.principal * (1 + client.interestRate / 100);
      g.totalPrincipal += client.principal;
      g.totalReturn += clientReturn;
      g.totalProfit += (clientReturn - client.principal);

      // Accumulate Progress
      const paidCount = client.installmentsList ? client.installmentsList.filter(i => i.isPaid).length : 0;
      g.totalPaidCount += paidCount;
      g.totalInstallmentCount += client.installments;

      // Determine Dates
      if (new Date(client.startDate) < new Date(g.earliestDate)) {
        g.earliestDate = client.startDate;
      }

      // Check Installments for Status
      let hasOverdue = false;
      let hasWarning = false;
      let hasActive = false;

      client.installmentsList.forEach(inst => {
          if (!inst.isPaid) {
              const days = getDaysUntilDue(inst.dueDate);
              if (days < 0) hasOverdue = true;
              else if (days <= 1) hasWarning = true; // Today (0) or Tomorrow (1)
              else hasActive = true;
          }
      });

      // Determine Overall Status Priority: Late > Warning > Active > Completed
      if (hasOverdue) {
        g.overallStatus = 'Late';
      } else if (hasWarning && g.overallStatus !== 'Late') {
        g.overallStatus = 'Warning';
      } else if (hasActive && g.overallStatus !== 'Late' && g.overallStatus !== 'Warning') {
        g.overallStatus = 'Active';
      }
    });

    // Sort groups alphabetically
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients]);

  // Handle auto-focus/scroll from notifications
  useEffect(() => {
    if (focusTarget) {
      // 1. Expand the client
      setExpandedClientName(focusTarget.name);
      
      // 2. Scroll to the row (wait briefly for expansion to render/state to settle)
      setTimeout(() => {
        // We sanitize the name for ID usage just in case, though the key in the loop below matches exact name
        const element = document.getElementById(`client-row-${focusTarget.name}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [focusTarget]);

  const getInstallmentStatusColor = (installment: Installment) => {
    if (installment.isPaid) return 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400';
    
    const days = getDaysUntilDue(installment.dueDate);

    // Red: Overdue (days < 0)
    if (days < 0) return 'bg-red-500/10 border-red-500/50 text-red-400'; 
    
    // Orange: Due Today (0) or Tomorrow (1) - The "24h" logic
    if (days >= 0 && days <= 1) return 'bg-orange-500/10 border-orange-500/50 text-orange-400'; 
    
    // Warning Setting: If warningDays is larger than 1, allow slight yellow/orange tint for those too
    if (days > 1 && days <= warningDays) return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400';

    return 'bg-slate-700/50 border-slate-600 text-slate-300'; // Future
  };

  const getStatusText = (installment: Installment) => {
    if (installment.isPaid) return 'PAGO';
    
    const days = getDaysUntilDue(installment.dueDate);

    if (days < 0) return 'VENCIDO';
    if (days === 0) return 'VENCE HOJE';
    if (days === 1) return 'AMANHÃ';
    if (days > 1 && days <= warningDays) return `EM ${days} DIAS`;
    
    return 'ABERTO';
  }

  const getStatusBadge = (status: string) => {
    switch(status) {
        case 'Completed': return <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded border border-blue-500/30 uppercase font-bold">Concluído</span>;
        case 'Late': return <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded border border-red-500/30 uppercase font-bold flex items-center gap-1"><AlertTriangle size={10} /> Atrasado</span>;
        case 'Warning': return <span className="bg-orange-500/20 text-orange-400 text-[10px] px-2 py-0.5 rounded border border-orange-500/30 uppercase font-bold flex items-center gap-1"><Clock size={10} /> Vence Logo</span>;
        default: return <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded border border-emerald-500/30 uppercase font-bold">Ativo</span>;
    }
  }

  const getRowStyle = (isLate: boolean, isWarning: boolean, isExpanded: boolean) => {
      if (isLate) {
          return isExpanded ? 'bg-red-500/10 border-red-500' : 'bg-red-900/10 border-red-500/50 hover:bg-red-900/20';
      }
      if (isWarning) {
          return isExpanded ? 'bg-orange-500/10 border-orange-500' : 'bg-orange-900/10 border-orange-500/50 hover:bg-orange-900/20';
      }
      return isExpanded ? 'bg-slate-700/50 border-transparent' : 'hover:bg-slate-700/30 border-transparent';
  };

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
              <th className="px-6 py-4">Total Principal</th>
              <th className="px-6 py-4">Progresso Global</th>
              <th className="px-6 py-4">Retorno Total</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {groupedClients.map((group) => {
              const isExpanded = expandedClientName === group.name;
              const globalProgress = group.totalInstallmentCount > 0 
                ? (group.totalPaidCount / group.totalInstallmentCount) * 100 
                : 0;
              
              const isLate = group.overallStatus === 'Late';
              const isWarning = group.overallStatus === 'Warning';

              return (
                <React.Fragment key={group.name}>
                  <tr 
                    id={`client-row-${group.name}`}
                    className={`transition-all border-l-4 ${getRowStyle(isLate, isWarning, isExpanded)}`}
                  >
                    <td className="px-6 py-4 cursor-pointer" onClick={() => toggleExpand(group.name)}>
                      <div className="flex flex-col">
                        <span className="font-medium text-white flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2">
                             <User size={14} className={isLate ? "text-red-400" : (isWarning ? "text-orange-400" : "text-blue-400")}/> 
                             {group.name}
                          </div>
                          {getStatusBadge(group.overallStatus)}
                          
                          {/* Multiple Loans Badge */}
                          {group.loans.length > 1 && (
                            <span className="bg-purple-500/20 text-purple-300 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 uppercase font-bold flex items-center gap-1" title="Empréstimos ativos">
                                <Layers size={10} /> {group.loans.length}
                            </span>
                          )}
                        </span>
                        {group.phone && (
                          <span className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                            <Phone size={12} /> {group.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-300 font-mono">
                      {formatCurrency(group.totalPrincipal)}
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-2 w-32">
                          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden">
                             <div 
                                className={`h-full transition-all duration-500 ${isLate ? 'bg-red-500' : (isWarning ? 'bg-orange-500' : 'bg-emerald-500')}`} 
                                style={{ width: `${globalProgress}%` }}
                             ></div>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">{Math.round(globalProgress)}%</span>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                          <span className="text-white font-bold font-mono">
                              {formatCurrency(group.totalReturn)}
                          </span>
                          <span className="text-xs text-emerald-400">
                              Lucro: +{formatCurrency(group.totalProfit)}
                          </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                            onClick={() => toggleExpand(group.name)}
                            className="text-slate-400 hover:text-white p-2 flex items-center gap-1 text-xs uppercase font-bold bg-slate-700/50 rounded-lg hover:bg-slate-600 transition-all"
                        >
                            {isExpanded ? (
                                <>Fechar <ChevronUp size={16} /></>
                            ) : (
                                <>Detalhes <ChevronDown size={16} /></>
                            )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Expanded Details - List of Loans */}
                  {isExpanded && (
                      <tr className="bg-slate-800/80 shadow-inner">
                          <td colSpan={5} className="p-0">
                            <div className="flex flex-col gap-1 bg-slate-900/30 p-4">
                                {group.loans.map((loan, index) => {
                                    const loanTotalReturn = loan.principal * (1 + loan.interestRate / 100);
                                    const loanProfit = loanTotalReturn - loan.principal;
                                    const dateFormatted = loan.startDate.split('-').reverse().join('/');
                                    const loanPaidCount = loan.installmentsList.filter(i => i.isPaid).length;
                                    const loanProgress = (loanPaidCount / loan.installments) * 100;

                                    return (
                                        <div key={loan.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden mb-4 last:mb-0 shadow-lg">
                                            {/* Loan Header */}
                                            <div className="bg-slate-900/80 p-4 border-b border-slate-700 flex flex-wrap justify-between items-center gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 text-slate-400 font-mono text-xs text-center">
                                                        <div className="uppercase text-[10px] text-slate-500">Início</div>
                                                        <div className="font-bold text-white">{dateFormatted}</div>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-white font-bold text-lg">{formatCurrency(loan.principal)}</span>
                                                            {getStatusBadge(loan.status)}
                                                        </div>
                                                        <div className="text-xs text-slate-400 flex items-center gap-2">
                                                            <TrendingUp size={12} /> Taxa: <span className="text-emerald-400">{loan.interestRate.toFixed(1)}%</span>
                                                            <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                                            Lucro: <span className="text-emerald-400">+{formatCurrency(loanProfit)}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <div className="text-right mr-4 hidden sm:block">
                                                        <div className="text-[10px] text-slate-500 uppercase font-bold">Progresso</div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                                <div className="h-full bg-blue-500" style={{ width: `${loanProgress}%` }}></div>
                                                            </div>
                                                            <span className="text-xs text-blue-400 font-mono">{loanPaidCount}/{loan.installments}</span>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => onDuplicate(loan)}
                                                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                        title="Duplicar este empréstimo"
                                                    >
                                                        <Copy size={18} />
                                                    </button>
                                                    <button 
                                                        onClick={() => onDelete(loan.id)}
                                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                                                        title="Excluir este empréstimo"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Installments Grid & Annotation */}
                                            <div className="p-4 bg-slate-900/50">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                                        <Calendar size={14} /> Parcelas do Empréstimo
                                                    </h4>
                                                </div>
                                                
                                                {/* Editable Annotation Field */}
                                                <div className="mb-4">
                                                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block flex items-center gap-1">
                                                         <StickyNote size={10} /> Anotações (Editável)
                                                    </label>
                                                    <textarea 
                                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-sm text-slate-300 focus:border-emerald-500 focus:outline-none resize-none placeholder-slate-600"
                                                        rows={2}
                                                        placeholder="Clique para adicionar observações..."
                                                        defaultValue={loan.annotation || ''}
                                                        onBlur={(e) => {
                                                            if (e.target.value !== (loan.annotation || '')) {
                                                                onUpdateAnnotation(loan.id, e.target.value);
                                                            }
                                                        }}
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                                    {loan.installmentsList?.map((inst) => {
                                                        const statusColor = getInstallmentStatusColor(inst);
                                                        const statusText = getStatusText(inst);
                                                        const displayDate = inst.dueDate.split('-').reverse().join('/');
                                                        // Critical check for button visibility: Overdue (days < 0) or Today (days == 0)
                                                        const days = getDaysUntilDue(inst.dueDate);
                                                        const isCritical = days <= 0 && !inst.isPaid;

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
                                                                    <div className="flex items-center gap-2">
                                                                        {isCritical && loan.phone && (
                                                                           <a 
                                                                             href={generateWhatsAppLink(loan.phone, loan.name, inst.number, inst.value, inst.dueDate)}
                                                                             target="_blank"
                                                                             rel="noopener noreferrer"
                                                                             className="p-2 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500 hover:text-white transition-all shadow-lg"
                                                                             title="Cobrar no WhatsApp"
                                                                           >
                                                                             <MessageCircle size={20} />
                                                                           </a>
                                                                        )}
                                                                        <button 
                                                                            onClick={() => onTogglePayment(loan.id, inst.number)}
                                                                            className={`p-2 rounded-full transition-all ${inst.isPaid ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                                                            title={inst.isPaid ? "Marcar como não pago" : "Marcar como pago"}
                                                                        >
                                                                            <CheckCircle size={20} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
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