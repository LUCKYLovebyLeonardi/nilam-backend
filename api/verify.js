import { createClient } from '@supabase/supabase-js';

// Make sure you replace the placeholders below with your actual project credentials!
const supabase = createClient('https://your-actual-project-id.supabase.co', 'your-actual-service-role-secret-key');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
// ... the rest of your code continues below ...
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, key, user, currentIdx } = req.query;

    if (!key || !user) {
        return res.status(400).json({ error: "Context parameters missing." });
    }

    // 1. Verify License Key validity
    const { data: license, error: licError } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', key)
        .single();

    if (licError || !license || license.status !== 'active') {
        return res.status(200).json({ valid: false, message: "Invalid key." });
    }

    // 2. Account Binding Logic
    if (!license.assigned_user) {
        await supabase.from('licenses').update({ assigned_user: user }).eq('id', license.id);
    } else if (license.assigned_user !== user) {
        return res.status(200).json({ valid: false, message: "Invalid key." });
    }

    // 3. Out of credit check
    if (license.credits <= 0) {
        return res.status(200).json({ valid: false, message: "You've used up all your books credit." });
    }

    // 4. If action is deduct, reduce balance by 1 row credit
    if (action === 'deduct') {
        const newCredits = license.credits - 1;
        await supabase.from('licenses').update({ credits: newCredits }).eq('id', license.id);
        
        return res.status(200).json({ 
            valid: true, 
            credits: newCredits, 
            message: newCredits <= 0 ? "You've used up all your books credit." : "Success" 
        });
    }

    // 5. SECURELY FETCH THE BOOK FROM THE SQL DATABASE
    // We match the requested local index to your books table column
    const bookIdx = parseInt(currentIdx || '0') % 20; // Loops back to 0 after 20 books

    const { data: bookData, error: bookError } = await supabase
        .from('books')
        .select('title, author, pages, publisher, year, synopsis, moral_lesson')
        .eq('book_index', bookIdx)
        .single();

    if (bookError || !bookData) {
        return res.status(200).json({ valid: false, message: "Error retrieval mapping from SQL books storage." });
    }

    // 6. Return standard clean map payload back to client script
    return res.status(200).json({
        valid: true,
        credits: license.credits,
        bookData: {
            t: bookData.title,
            p: bookData.author,
            m: bookData.pages,
            pub: bookData.publisher,
            y: bookData.year,
            r: bookData.synopsis,
            n: bookData.moral_lesson
        }
    });
}
