
// Cek apakah credentials tersedia di window.ENV
const SUPABASE_URL = window.ENV?.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY;

// Validasi credentials
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Supabase credentials tidak ditemukan!');
    console.error('Pastikan file env.js sudah diload sebelum utils.js');
    throw new Error('Missing Supabase credentials');
}

// PAKAI NAMA BERBEDA: supabaseClient (bukan supabase)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Fungsi untuk generate kode session unik
function generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

// Simpan session ke database - PAKAI supabaseClient
async function saveGameSession(mode, mapData, contestants) {
    const sessionCode = generateSessionCode()
    
    const { data: existing } = await supabaseClient
        .from('game_sessions')
        .select('session_code')
        .eq('session_code', sessionCode)
    
    if (existing && existing.length > 0) {
        return saveGameSession(mode, mapData, contestants)
    }
    
    const { data: session, error: sessionError } = await supabaseClient
        .from('game_sessions')
        .insert([{
            session_code: sessionCode,
            mode: mode,
            map_id: mapData.id,
            map_data: mapData,
            status: 'waiting'
        }])
        .select()
        .single()
    
    if (sessionError) throw sessionError
    
    const contestantsData = contestants.map(c => ({
        session_id: session.id,
        contestant_name: c.name,
        contestant_emoji: c.displayEmoji || c.emoji || c.flag,
        contestant_category: c.category,
        contestant_data: c
    }))
    
    const { error: contestantsError } = await supabaseClient
        .from('session_contestants')
        .insert(contestantsData)
    
    if (contestantsError) throw contestantsError
    
    return session
}

// Update hasil game - PAKAI supabaseClient
async function updateGameResult(sessionId, roundNumber, escapedContestants, duration) {
    await supabaseClient
        .from('game_sessions')
        .update({ 
            status: 'completed',
            completed_at: new Date()
        })
        .eq('id', sessionId)
    
    for (let i = 0; i < escapedContestants.length; i++) {
        const contestant = escapedContestants[i]
        await supabaseClient
            .from('session_contestants')
            .update({ 
                escaped_order: i + 1,
                escaped_at: new Date(),
                round_number: roundNumber
            })
            .eq('session_id', sessionId)
            .eq('contestant_name', contestant.name)
    }
    
    const winner = escapedContestants[0]
    await supabaseClient
        .from('game_history')
        .insert([{
            session_id: sessionId,
            round_number: roundNumber,
            winner_name: winner.name,
            winner_emoji: winner.displayEmoji || winner.emoji || winner.flag,
            escaped_contestants: escapedContestants,
            duration_seconds: duration
        }])
    
    await updateGlobalLeaderboard(winner.name, winner.displayEmoji || winner.emoji || winner.flag)
}

// Update global leaderboard - PAKAI supabaseClient
async function updateGlobalLeaderboard(playerName, playerEmoji) {
    const { data: existing } = await supabaseClient
        .from('global_leaderboard')
        .select('*')
        .eq('player_name', playerName)
    
    if (existing && existing.length > 0) {
        await supabaseClient
            .from('global_leaderboard')
            .update({ 
                total_wins: existing[0].total_wins + 1,
                total_games: existing[0].total_games + 1,
                updated_at: new Date()
            })
            .eq('id', existing[0].id)
    } else {
        await supabaseClient
            .from('global_leaderboard')
            .insert([{
                player_name: playerName,
                player_emoji: playerEmoji,
                total_wins: 1,
                total_games: 1
            }])
    }
}

// Ambil global leaderboard - PAKAI supabaseClient
async function getGlobalLeaderboard(limit = 10) {
    const { data, error } = await supabaseClient
        .from('global_leaderboard')
        .select('*')
        .order('total_wins', { ascending: false })
        .limit(limit)
    
    if (error) throw error
    return data
}

// Ambil history session - PAKAI supabaseClient
async function getSessionHistory(sessionId) {
    const { data, error } = await supabaseClient
        .from('game_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('round_number', { ascending: true })
    
    if (error) throw error
    return data
}

// Export fungsi - NAMA TETAP gameDB
window.gameDB = {
    saveGameSession,
    updateGameResult,
    getGlobalLeaderboard,
    getSessionHistory
}