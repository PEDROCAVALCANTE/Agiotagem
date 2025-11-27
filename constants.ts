import { Client, ProgressionPoint } from './types';

// Default interest rate if not specified
export const DEFAULT_INTEREST_RATE = 20; 

// Generate a random ID
export const generateId = (): string => Math.random().toString(36).substring(2, 9);

// Format currency BRL
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Calculate days until due (handling local time correctly)
export const getDaysUntilDue = (dueDateString: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse YYYY-MM-DD explicitly to avoid UTC issues with new Date(string)
  const [year, month, day] = dueDateString.split('-').map(Number);
  const due = new Date(year, month - 1, day);

  const diffTime = due.getTime() - today.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

// User provided Firebase Credentials
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCrsZQpDusua60XLcGXRfBIKb6exrRiP3I",
  authDomain: "giliarde-agi.firebaseapp.com",
  projectId: "giliarde-agi",
  storageBucket: "giliarde-agi.firebasestorage.app",
  messagingSenderId: "1052082323824",
  appId: "1:1052082323824:web:c1acb45f34fc6b8ae44fb5"
};

// Calculate progression data for charts
export const calculateProgression = (clients: Client[]): ProgressionPoint[] => {
  // Find the max number of installments to determine x-axis length
  const maxInstallments = Math.max(...clients.map(c => c.installments), 0) || 6;
  
  const data: ProgressionPoint[] = [];

  for (let i = 1; i <= maxInstallments; i++) {
    let monthlyPrincipalReturn = 0;
    let monthlyInterestReturn = 0;

    clients.forEach(client => {
      if (i <= client.installments) {
        const totalOwed = client.principal * (1 + client.interestRate / 100);
        const monthlyPayment = totalOwed / client.installments;
        const principalPart = client.principal / client.installments;
        
        monthlyPrincipalReturn += principalPart;
        monthlyInterestReturn += (monthlyPayment - principalPart);
      }
    });

    // Cumulative logic for "Progression"
    const prevPrincipal = data.length > 0 ? data[data.length - 1].principal : 0;
    const prevInterest = data.length > 0 ? data[data.length - 1].interest : 0;

    data.push({
      name: `Mês ${i}`,
      principal: Math.round(prevPrincipal + monthlyPrincipalReturn),
      interest: Math.round(prevInterest + monthlyInterestReturn),
      total: Math.round(prevPrincipal + monthlyPrincipalReturn + prevInterest + monthlyInterestReturn)
    });
  }
  
  return data;
};