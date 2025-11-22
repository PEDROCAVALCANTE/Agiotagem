export interface Installment {
  number: number;
  dueDate: string; // ISO Date string YYYY-MM-DD
  value: number;
  isPaid: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  principal: number; // The amount lent
  installments: number; // Number of payments
  interestRate: number; // Monthly percentage (e.g., 10, 20)
  startDate: string;
  status: 'Active' | 'Completed' | 'Late';
  installmentsList: Installment[]; // Detailed breakdown
}

export interface FinancialSummary {
  totalInvested: number;
  totalRevenueExpected: number;
  totalProfit: number;
  activeClients: number;
  averageRoi: number;
}

export interface ProgressionPoint {
  name: string; // e.g., "Month 1"
  principal: number;
  interest: number;
  total: number;
}