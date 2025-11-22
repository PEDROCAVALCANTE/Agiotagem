import { GoogleGenAI } from "@google/genai";
import { Client } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API Key not found");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const analyzePortfolio = async (clients: Client[]): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "API Key missing. Cannot generate insights.";

  const portfolioData = clients.map(c => ({
    name: c.name,
    invested: c.principal,
    rate: c.interestRate + "%",
    months: c.installments,
    totalReturn: c.principal * (1 + c.interestRate/100)
  }));

  const prompt = `
    You are a senior financial portfolio manager. Analyze the following loan portfolio data (in JSON format).
    
    Data: ${JSON.stringify(portfolioData)}

    Please provide a brief, high-level executive summary (max 3 paragraphs) covering:
    1. Total risk exposure.
    2. Projected profitability.
    3. Advice on diversification or risk management based on the current distribution.
    
    Keep the tone professional, analytical, and concise. Do not use markdown bolding excessively.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("AI Error:", error);
    return "Unable to generate analysis at this time due to an error.";
  }
};