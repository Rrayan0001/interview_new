import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Extract data from payload
    const totals = payload.totals || {};
    
    // Calculate score
    const overallScore = totals.overall || 0;
    const totalQuestions = totals.totalQuestions || 1;
    const scorePercentage = totalQuestions > 0 ? (overallScore / totalQuestions) * 100 : 0;
    
    return NextResponse.json({
      score: Math.round(scorePercentage * 100) / 100,
      overall: overallScore,
      total: totalQuestions,
      aptitude: totals.aptitude || 0,
      reasoning: totals.reasoning || 0,
      coding: totals.coding || 0
    });
    
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
