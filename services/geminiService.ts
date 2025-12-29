
import { GoogleGenAI } from "@google/genai";
import { Customer, Order, OrderStatusConfiguration } from '../types';
import { calculateOrderTotals } from '../utils/calculations';

export const generateDashboardSummary = async (customers: Customer[], orders: Order[], statusConfigs: OrderStatusConfiguration[]): Promise<string> => {
    const customerCount = customers.length;
    const orderCount = orders.length;

    const { totalRevenue, totalCost } = orders.reduce((acc, order) => {
        const { totalAmount, totalCost } = calculateOrderTotals(order);
        acc.totalRevenue += totalAmount;
        acc.totalCost += totalCost;
        return acc;
    }, { totalRevenue: 0, totalCost: 0 });

    const netProfit = totalRevenue - totalCost;

    // Filter open orders dynamically based on flags
    const openOrdersValue = orders
        .filter(o => {
            const config = statusConfigs.find(c => c.label === o.orderStatus);
            // Open = active but not completed and not lost
            return config?.isActiveDeal && !config?.isCompleted && !config?.isLost;
        })
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
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
        return response.text || '';
    } catch (error) {
        console.error("Error generating summary with Gemini:", error);
        return "הייתה שגיאה ביצירת סיכום ה-AI. אנא בדוק את הקונסול לפרטים נוספים.";
    }
};
