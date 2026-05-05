import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

function parsePercent(s: string): number | null {
  if (!s) return null;
  const num = parseFloat(s.replace("%", "").trim());
  return isNaN(num) ? null : num;
}

function parseCgpa(s: string): number | null {
  if (!s) return null;
  const num = parseFloat(s.split("/")[0].trim());
  return isNaN(num) ? null : num;
}

function computeResumeStrength(row: any): string {
  const cgpa = parseCgpa(row.degree_percentage_or_cgpa);
  const twelfth = parsePercent(row.twelfth_percentage);
  const tenth = parsePercent(row.tenth_percentage);
  const expLen = Array.isArray(row.experience) ? row.experience.length : 0;
  
  let score = 0;
  if (cgpa !== null) {
    if (cgpa >= 9.0) score += 4;
    else if (cgpa >= 8.0) score += 3;
    else if (cgpa >= 7.0) score += 2;
    else score += 1;
  }
  if (twelfth !== null) {
    if (twelfth >= 95) score += 4;
    else if (twelfth >= 90) score += 3;
    else if (twelfth >= 80) score += 2;
    else score += 1;
  }
  if (tenth !== null) {
    if (tenth >= 95) score += 3;
    else if (tenth >= 85) score += 2;
    else score += 1;
  }
  
  if (expLen >= 3) score += 4;
  else if (expLen === 2) score += 3;
  else if (expLen === 1) score += 2;
  else score += 1;

  if (score >= 12) return "EXTREMELY_STRONG";
  if (score >= 9) return "STRONG";
  if (score >= 6) return "AVERAGE";
  return "WEAK";
}

function finalLevelByMatrix(strength: string, userLevel: string): string {
  const u = userLevel.toLowerCase();
  if (strength === "WEAK") {
    if (u === "beginner") return "beginner";
    if (u === "intermediate") return "beginner";
    if (u === "advance") return "intermediate";
  } else if (strength === "AVERAGE") {
    if (u === "beginner") return "beginner";
    if (u === "intermediate") return "intermediate";
    if (u === "advance") return "advance";
  } else if (strength === "STRONG") {
    if (u === "beginner") return "beginner";
    if (u === "intermediate") return "advance";
    if (u === "advance") return "advance";
  } else if (strength === "EXTREMELY_STRONG") {
    if (u === "beginner") return "beginner";
    if (u === "intermediate") return "advance";
    if (u === "advance") return "advance";
  }
  return u;
}

function parseTxtFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").map(l => l.trimRight());
  
  const out: any[] = [];
  let cur: string[] = [];
  let curLevel = "beginner";
  
  const flush = (seg: string[], level: string) => {
    const txt = seg.join("\n").trim();
    if (!txt) return;
    
    const ansMatch = txt.match(/Answer:\s*([A-Da-d])/);
    if (!ansMatch) return;
    const ansKey = ansMatch[1].toUpperCase();
    
    let head = txt.split(/Answer:\s*[A-Da-d]/)[0].trim();
    head = head.replace(/^(Q?\d+\.\s*)/, "");
    
    let question = head;
    const options: string[] = [];
    
    const optsMatch = head.match(/A\)\s*([\s\S]*?)\s+B\)\s*([\s\S]*?)\s+C\)\s*([\s\S]*?)\s+D\)\s*([\s\S]*)/);
    if (optsMatch) {
      question = head.substring(0, optsMatch.index).trim().replace(/:$/, "").trim();
      options.push(optsMatch[1].trim(), optsMatch[2].trim(), optsMatch[3].trim(), optsMatch[4].trim());
    } else {
      const lines = head.split("\n");
      question = lines[0].trim().replace(/:$/, "").trim();
      for (const optKey of ["A", "B", "C", "D"]) {
        const regex = new RegExp(`^${optKey}[\\).\\]]\\s*(.*)$`, "m");
        const mm = head.match(regex);
        if (mm) options.push(mm[1].trim());
      }
    }
    
    let correct = "";
    if (options.length > 0) {
      const idx = {"A":0, "B":1, "C":2, "D":3}[ansKey];
      if (idx !== undefined && idx < options.length) {
        correct = options[idx];
      }
    }
    
    out.push({
      question,
      options,
      correct_answer: correct,
      explanation: "",
      level
    });
  };
  
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const low = ln.toLowerCase();
    if (low.includes("beginner")) { curLevel = "beginner"; continue; }
    if (low.includes("intermediate")) { curLevel = "intermediate"; continue; }
    if (low.includes("advanced")) { curLevel = "advance"; continue; }
    
    cur.push(ln);
    if (ln.trim().startsWith("Answer:")) {
      flush(cur, curLevel);
      cur = [];
    }
  }
  if (cur.length > 0) flush(cur, curLevel);
  
  // Fallback indexing
  if (out.length === 0) {
    // Basic split fallback omitted for brevity, usually the above works for the given txt files
  } else {
    // If levels not parsed properly, assign by position
    if (out.every(q => q.level === "beginner")) {
      out.forEach((q, i) => {
        q.level = i < 40 ? "beginner" : (i < 70 ? "intermediate" : "advance");
      });
    }
  }
  
  return out;
}

function pickByLevel(items: any[], level: string, count: number) {
  const pool = items.filter(q => (q.level || "").toLowerCase() === level.toLowerCase());
  if (pool.length < count) {
    const chosen = [...pool];
    const remaining = items.filter(q => !chosen.includes(q));
    remaining.sort(() => 0.5 - Math.random());
    chosen.push(...remaining.slice(0, Math.max(0, count - chosen.length)));
    return chosen.slice(0, count);
  }
  pool.sort(() => 0.5 - Math.random());
  return pool.slice(0, count);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const userId = payload.user_id;
    const levels = {
      aptitude: payload.aptitude_level || "beginner",
      reasoning: payload.reasoning_level || "beginner",
      coding: payload.coding_level || "beginner"
    };
    const counts = payload.counts || {};
    const numApt = parseInt(counts.aptitude || "10", 10);
    const numRea = parseInt(counts.reasoning || "10", 10);
    const numCod = parseInt(counts.coding || "10", 10);
    
    let resumeRow: any = {};
    if (payload.resume) {
      resumeRow = payload.resume;
    } else if (userId) {
      const dbPool = getPool();
      if (dbPool) {
        const res = await dbPool.query("SELECT * FROM user_profiles WHERE id=$1", [userId]);
        if (res.rows.length > 0) {
          resumeRow = res.rows[0];
        }
      }
    }
    
    const strength = computeResumeStrength(resumeRow);
    const finalLevels = {
      aptitude: finalLevelByMatrix(strength, levels.aptitude),
      reasoning: finalLevelByMatrix(strength, levels.reasoning),
      coding: finalLevelByMatrix(strength, levels.coding)
    };
    
    // Read files from data dir
    const dataDir = path.join(process.cwd(), "data");
    const bank = {
      aptitude: parseTxtFile(path.join(dataDir, "aptitude.txt")),
      reasoning: parseTxtFile(path.join(dataDir, "reasoning.txt")),
      coding: parseTxtFile(path.join(dataDir, "coding.txt"))
    };
    
    const out = {
      aptitude: {
        final_level: finalLevels.aptitude,
        questions: pickByLevel(bank.aptitude, finalLevels.aptitude, numApt)
      },
      reasoning: {
        final_level: finalLevels.reasoning,
        questions: pickByLevel(bank.reasoning, finalLevels.reasoning, numRea)
      },
      coding: {
        final_level: finalLevels.coding,
        questions: pickByLevel(bank.coding, finalLevels.coding, numCod)
      }
    };
    
    return NextResponse.json(out);
  } catch (e: any) {
    console.error("Select Questions Error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
