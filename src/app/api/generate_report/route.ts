import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        report_markdown: "# Report Generation Unavailable\n\nGROQ_API_KEY not configured.",
        error: "GROQ_API_KEY not configured"
      });
    }
    
    const client = new Groq({ apiKey });
    
    const answers = payload.answers || [];
    const totals = payload.totals || {};
    const behavior = payload.behavior || {};
    const profile = payload.profile || {};
    const model = payload.model || "llama-3.1-8b-instant";
    
    const systemPrompt = `You are a precise assessment analyst. Create a Career & Skill Development Report based solely on the provided data.
Rules:
- Use the user's results and academic profile only; do not invent data.
- Professional tone, clear headings, bullet points where helpful.
- Sections: Performance Analysis; Skill Gap Analysis; Personalized 6-Week Improvement Plan; Career Guidance; Internship Recommendations; Final Summary.
- Keep recommendations realistic for current level. Do not include code fences.
- CRITICAL: If the user scored 0 or left most questions unattempted, DO NOT provide generic high-level advice like applying to IBM or Google. Instead, acknowledge the low/zero score, suggest that they may have skipped the test or need to build foundational knowledge from absolute scratch. Tailor the improvement plan to extreme basics and recommend revisiting the test when ready.`;

    const userContent = {
      test_results: {
        answers,
        totals,
        behavior
      },
      academic_profile: profile,
      format_instructions: {
        headings: true,
        no_code: true,
        language: "English"
      }
    };
    
    const completion = await client.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userContent) }
      ],
      temperature: 0.2
    });
    
    const content = completion.choices[0].message.content || "";
    
    return NextResponse.json({ report_markdown: content.trim() });
    
  } catch (err: any) {
    console.error("Generate Report Error:", err);
    return NextResponse.json({ 
      report_markdown: `# Report Generation Error\n\n${err.message || "Failed to generate report"}`,
      error: err.message 
    }, { status: 500 });
  }
}
