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

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const user_id = payload.user_id;
    const aptitude = payload.aptitude_level;
    const reasoning = payload.reasoning_level;
    const coding = payload.coding_level;
    
    if (!user_id || !aptitude || !reasoning || !coding) {
      return NextResponse.json({ error: "missing fields" }, { status: 400 });
    }
    
    const dbPool = getPool();
    if (!dbPool) {
      return NextResponse.json({ saved: false });
    }
    
    await dbPool.query(
      `UPDATE user_profiles 
       SET aptitude_level=$1, reasoning_level=$2, coding_level=$3 
       WHERE id=$4`,
      [aptitude, reasoning, coding, user_id]
    );
    
    return NextResponse.json({ saved: true });
    
  } catch (err: any) {
    console.error("Responses API Error:", err);
    return NextResponse.json({ saved: false, error: err.message }, { status: 500 });
  }
}
