import { tool } from 'ai';
import { z } from 'zod';

/**
 * Example tools for demonstration
 * These can be replaced with your actual business tools
 */
export const tools = {
  getUser: tool({
    description: 'Get user information by ID',
    inputSchema: z.object({ 
      id: z.string().describe('User ID') 
    }),
    execute: async ({ id }) => {
      console.log(`[TOOL] Getting user ${id}`);
      // Simulate user data
      return { 
        id, 
        name: `User ${id}`, 
        score: Math.floor(Math.random() * 100),
        department: ['engineering', 'sales', 'marketing'][Math.floor(Math.random() * 3)]
      };
    },
  }),

  calculateAverage: tool({
    description: 'Calculate average from array of numbers',
    inputSchema: z.object({ 
      numbers: z.array(z.number()).describe('Array of numbers to average') 
    }),
    execute: async ({ numbers }) => {
      console.log(`[TOOL] Calculating average of ${numbers.length} numbers`);
      const sum = numbers.reduce((a, b) => a + b, 0);
      return { average: sum / numbers.length, count: numbers.length };
    },
  }),

  filterByScore: tool({
    description: 'Filter users by minimum score threshold',
    inputSchema: z.object({ 
      users: z.array(z.object({ 
        id: z.string(), 
        score: z.number() 
      })),
      minScore: z.number().describe('Minimum score threshold')
    }),
    execute: async ({ users, minScore }) => {
      console.log(`[TOOL] Filtering ${users.length} users with min score ${minScore}`);
      return users.filter(u => u.score >= minScore);
    },
  }),
};

