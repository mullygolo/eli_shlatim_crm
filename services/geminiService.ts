
import { GoogleGenAI } from "@google/genai";
// FIX: Added OrderStatus to the import.
import { Customer, Order, OrderStatus } from '../types';
import { calculateOrderTotals } from '../utils/calculations';

export const generateDashboardSummary = async (customers: Customer[], orders: Order[]): Promise<string> => {
    const customerCount = customers.length;
    const orderCount = orders.length;

    const { totalRevenue, totalCost } = orders.reduce((acc, order) => {
        const { totalAmount, totalCost } = calculateOrderTotals(order);
        acc.totalRevenue += totalAmount;
        acc.totalCost += totalCost;
        return acc;
    }, { totalRevenue: 0, totalCost: 0 });

    const netProfit = totalRevenue - totalCost;

    const openOrdersValue = orders
        .filter(o => ![
            OrderStatus.SHIPPED, 
            OrderStatus.DELIVERED_AT_FACTORY, 
            OrderStatus.INSTALLED, 
            OrderStatus.IN_COLLECTION,
            OrderStatus.CANCELED_IRRELEVANT,
            OrderStatus.CANCELED_EXPENSIVE,
            OrderStatus.CANCELED_BOUGHT_ELSEWHERE,
        ].includes(o.orderStatus as OrderStatus))
        .reduce((sum, o) => sum + calculateOrderTotals(o).totalAmount, 0);

    const prompt = `
        You are a business analyst AI for a CRM system.
        Analyze the following CRM data and provide a concise, insightful summary (2-3 paragraphs) of the business's current state in HEBREW.
        Focus on key metrics, potential opportunities, and areas that might need attention.
        The tone should be professional but encouraging.

        **Current CRM Data:**
        - Total Customers: ${customerCount}
        - Total Orders: ${orderCount}
        - Open Orders Value (Potential Revenue): ${openOrdersValue.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        - Total Revenue: ${totalRevenue.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        - Total Costs: ${totalCost.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        - Net Profit: ${netProfit.toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}
        
        Provide your summary as an HTML snippet, IN HEBREW. Use tags like <p>, <strong>, and <ul> for formatting.
    `;

    try {
        // FIX: Initialized GoogleGenAI inside the function to prevent app crash if API key is missing at startup
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        return response.text || '';
    } catch (error) {
        console.error("Error generating summary with Gemini:", error);
        return "הייתה שגיאה ביצירת סיכום ה-AI. אנא בדוק את הקונסול לפרטים נוספים.";
    }
};
