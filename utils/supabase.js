const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_PROJECT_ID, process.env.SUPABASE_KEY);


module.exports = supabase;