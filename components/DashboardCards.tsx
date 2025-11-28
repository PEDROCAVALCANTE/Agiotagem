import React from 'react';
import { FinancialSummary } from '../types';
import { formatCurrency } from '../constants';
import { TrendingUp, DollarSign, Users, Wallet } from 'lucide-react';

interface DashboardCardsProps {
  summary: FinancialSummary;
}

const Card: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => (
  <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
      <div className={`p-2 rounded-full bg-opacity-20 ${color}`}>
        {icon}
      </div>
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
  </div>
);

export const DashboardCards: React.FC<DashboardCardsProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card 
        title="Total Investido" 
        value={formatCurrency(summary.totalInvested)} 
        icon={<Wallet className="text-blue-400" size={24} />}
        color="bg-blue-500/20 text-blue-400"
      />
      <Card 
        title="Retorno Total Esperado" 
        value={formatCurrency(summary.totalRevenueExpected)} 
        icon={<DollarSign className="text-emerald-400" size={24} />}
        color="bg-emerald-500/20 text-emerald-400"
      />
      <Card 
        title="Lucro Total" 
        value={formatCurrency(summary.totalProfit)} 
        icon={<TrendingUp className="text-purple-400" size={24} />}
        color="bg-purple-500/20 text-purple-400"
      />
      <Card 
        title="Clientes Ativos" 
        value={summary.activeClients.toString()} 
        icon={<Users className="text-orange-400" size={24} />}
        color="bg-orange-500/20 text-orange-400"
      />
    </div>
  );
};