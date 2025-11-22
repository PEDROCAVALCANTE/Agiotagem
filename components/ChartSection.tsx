import React from 'react';
import { ProgressionPoint } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatCurrency } from '../constants';

interface ChartSectionProps {
  data: ProgressionPoint[];
}

export const ChartSection: React.FC<ChartSectionProps> = ({ data }) => {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg mb-8">
      <h2 className="text-xl font-bold text-white mb-6">Projeção de Recebimentos (Acumulado)</h2>
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" tickFormatter={(val) => `R$${val/1000}k`} />
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
              formatter={(value: number) => [formatCurrency(value), '']}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="principal" 
              stackId="1" 
              stroke="#3b82f6" 
              fill="url(#colorPrincipal)" 
              name="Capital Recuperado" 
            />
            <Area 
              type="monotone" 
              dataKey="interest" 
              stackId="1" 
              stroke="#10b981" 
              fill="url(#colorInterest)" 
              name="Lucro (Juros)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};