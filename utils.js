// utils.js - Simpan di folder yang sama
const SUPABASE_URL = 'https://oybrqkapikzrwkmkzmtb.supabase.co' // Ganti dengan URL projectmu
const SUPABASE_ANON_KEY = 'sb_publishable_kOlWyz_Uizvb8XdmFR867Q_EltekMRI' // Ganti dengan anon key

// Inisialisasi Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Fungsi untuk generate kode session unik
function generateSessionCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

// Simpan session ke database
async function saveGameSession(mode, mapData, contestants) {
    const sessionCode = generateSessionCode()
    
    // Cek apakah kode sudah ada
    const { data: existing } = await supabase
        .from('game_sessions')
        .select('session_code')
        .eq('session_code', sessionCode)
    
    if (existing && existing.length > 0) {
        return saveGameSession(mode, mapData, contestants) // generate ulang
    }
    
    // Simpan session
    const { data: session, error: sessionError } = await supabase
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
    
    // Simpan contestants
    const contestantsData = contestants.map(c => ({
        session_id: session.id,
        contestant_name: c.name,
        contestant_emoji: c.displayEmoji || c.emoji || c.flag,
        contestant_category: c.category,
        contestant_data: c
    }))
    
    const { error: contestantsError } = await supabase
        .from('session_contestants')
        .insert(contestantsData)
    
    if (contestantsError) throw contestantsError
    
    return session
}

// Update hasil game
async function updateGameResult(sessionId, roundNumber, escapedContestants, duration) {
    // Update session status
    await supabase
        .from('game_sessions')
        .update({ 
            status: 'completed',
            completed_at: new Date()
        })
        .eq('id', sessionId)
    
    // Update escaped order untuk contestants
    for (let i = 0; i < escapedContestants.length; i++) {
        const contestant = escapedContestants[i]
        await supabase
            .from('session_contestants')
            .update({ 
                escaped_order: i + 1,
                escaped_at: new Date(),
                round_number: roundNumber
            })
            .eq('session_id', sessionId)
            .eq('contestant_name', contestant.name)
    }
    
    // Simpan ke history
    const winner = escapedContestants[0]
    await supabase
        .from('game_history')
        .insert([{
            session_id: sessionId,
            round_number: roundNumber,
            winner_name: winner.name,
            winner_emoji: winner.displayEmoji || winner.emoji || winner.flag,
            escaped_contestants: escapedContestants,
            duration_seconds: duration
        }])
    
    // Update global leaderboard
    await updateGlobalLeaderboard(winner.name, winner.displayEmoji || winner.emoji || winner.flag)
}

// Update global leaderboard
async function updateGlobalLeaderboard(playerName, playerEmoji) {
    // Cek apakah player sudah ada
    const { data: existing } = await supabase
        .from('global_leaderboard')
        .select('*')
        .eq('player_name', playerName)
    
    if (existing && existing.length > 0) {
        // Update existing
        await supabase
            .from('global_leaderboard')
            .update({ 
                total_wins: existing[0].total_wins + 1,
                total_games: existing[0].total_games + 1,
                updated_at: new Date()
            })
            .eq('id', existing[0].id)
    } else {
        // Insert new
        await supabase
            .from('global_leaderboard')
            .insert([{
                player_name: playerName,
                player_emoji: playerEmoji,
                total_wins: 1,
                total_games: 1
            }])
    }
}

// Ambil global leaderboard
async function getGlobalLeaderboard(limit = 10) {
    const { data, error } = await supabase
        .from('global_leaderboard')
        .select('*')
        .order('total_wins', { ascending: false })
        .limit(limit)
    
    if (error) throw error
    return data
}

// Ambil history session
async function getSessionHistory(sessionId) {
    const { data, error } = await supabase
        .from('game_history')
        .select('*')
        .eq('session_id', sessionId)
        .order('round_number', { ascending: true })
    
    if (error) throw error
    return data
}

// Export fungsi
window.gameDB = {
    saveGameSession,
    updateGameResult,
    getGlobalLeaderboard,
    getSessionHistory
}