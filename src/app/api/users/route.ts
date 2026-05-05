import { NextResponse } from "next/server";
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

async function ensureTables(p: Pool) {
  try {
    await p.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
  } catch (e) {}
  
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      tenth_percentage TEXT,
      twelfth_percentage TEXT,
      degree_percentage_or_cgpa TEXT,
      experience JSONB,
      aptitude_level TEXT,
      reasoning_level TEXT,
      coding_level TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const name = (payload.name || "").trim();
    const email = (payload.email || "").trim();
    const phone = (payload.phone || "").trim();
    
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    
    const tenth = payload.tenth_percentage || "";
    const twelfth = payload.twelfth_percentage || "";
    const degree = payload.degree_percentage_or_cgpa || "";
    const exp = payload.experience || [];
    
    const dbPool = getPool();
    if (!dbPool) {
      return NextResponse.json({ user_id: "00000000-0000-0000-0000-000000000000", persisted: false });
    }
    
    await ensureTables(dbPool);
    
    if (email) {
      const res = await dbPool.query("SELECT id FROM user_profiles WHERE email=$1 LIMIT 1", [email]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        await dbPool.query(
          `UPDATE user_profiles 
           SET name=$1, phone=$2, tenth_percentage=$3, twelfth_percentage=$4, degree_percentage_or_cgpa=$5, experience=$6
           WHERE id=$7`,
          [name, phone || null, tenth, twelfth, degree, JSON.stringify(exp), row.id]
        );
        return NextResponse.json({ user_id: row.id, persisted: true });
      }
    }
    
    const res = await dbPool.query(
      `INSERT INTO user_profiles(name, email, phone, tenth_percentage, twelfth_percentage, degree_percentage_or_cgpa, experience)
       VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, email || null, phone || null, tenth, twelfth, degree, JSON.stringify(exp)]
    );
    
    return NextResponse.json({ user_id: res.rows[0].id, persisted: true });
    
  } catch (err: any) {
    console.error("Users API Error:", err);
    return NextResponse.json({ user_id: "00000000-0000-0000-0000-000000000000", persisted: false, db_error: err.message }, { status: 500 });
  }
}
