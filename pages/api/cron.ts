// pages/api/cron.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { stdout, stderr } = await execAsync('npm run cron');
        
        console.log('Cron output:', stdout);
        if (stderr) console.error('Cron errors:', stderr);
        
        return res.status(200).json({ 
            message: '✅ Cron handler işə salındı',
            output: stdout
        });
    } catch (error: any) {
        console.error('Cron execution error:', error);
        return res.status(500).json({ 
            message: '❌ Cron xətası',
            error: error.message 
        });
    }
}