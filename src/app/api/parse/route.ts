import { NextResponse } from "next/server";
import Groq from "groq-sdk";
const pdfParse = require("pdf-parse");

// Fallback regex parser for when Groq is unavailable
function fallbackParse(text: string) {
  let email = "";
  let phone = "";
  let tenth = "";
  let twelfth = "";
  let degree = "";
  let name = "";

  const emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (emailMatch) email = emailMatch[0];

  const phoneMatch = text.match(/(?:\+\d{1,3}[\s-]?)?\d{10}/);
  if (phoneMatch) phone = phoneMatch[0];

  const tenthMatch = text.match(/(?:10th|10|SSLC|SSC)[:\s]+(\d{1,2}(?:\.\d+)?%)/i);
  if (tenthMatch) tenth = tenthMatch[1];

  const twelfthMatch = text.match(/(?:12th|2\s*PU|2PU|PUC|HSC|Class\s*12|XII|Intermediate|Pre[- ]?University|Pre[- ]?Univ)[:\s\-]+(\d{1,2}(?:\.\d+)?\s*%)/i);
  if (twelfthMatch) twelfth = twelfthMatch[1];

  const cgpaMatch = text.match(/(\d(?:\.\d+)?\s*\/\s*10(?:\.0)?)/);
  if (cgpaMatch) degree = cgpaMatch[1].replace(/\s/g, "");

  const lines = text.split("\n");
  for (const line of lines) {
    const ln = line.trim();
    if (ln.split(/\s+/).length >= 2 && ln.length <= 80) {
      name = ln;
      break;
    }
  }

  return {
    name: name || "--",
    email: email || "--",
    phone: phone || "--",
    experience: [],
    tenth_percentage: tenth || "--",
    twelfth_percentage: twelfth || "--",
    degree_percentage_or_cgpa: degree || "--",
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("pdf") || formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No PDF file uploaded" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = "";
    try {
      // pdf-parse v1.1.1 is a function
      const parsedPdf = await pdfParse(buffer);
      text = parsedPdf.text;
      console.log("Successfully extracted text from PDF, length:", text.length);
    } catch (e) {
      console.error("PDF parsing error:", e);
      return NextResponse.json({ error: "Failed to parse PDF file" }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      const fallback = fallbackParse(text);
      return NextResponse.json({ ...fallback, note: "GROQ_API_KEY not configured" });
    }

    const client = new Groq({ apiKey });

    // The JSON schema definition
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        tenth_percentage: { type: "string", description: "10th grade marks (e.g. 90%)" },
        twelfth_percentage: { type: "string", description: "12th grade / PUC / HSC marks (e.g. 91%)" },
        degree_percentage_or_cgpa: { type: "string", description: "Degree / Graduation CGPA or Percentage (e.g. 8.45/10)" },
        links: {
          type: "object",
          properties: {
            linkedin: { type: "string" },
            github: { type: "string" },
            portfolio: { type: "string" }
          }
        },
        experience: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              company: { type: "string" },
              bullets: { type: "array", items: { type: "string" } }
            }
          }
        },
        skills: {
          type: "object",
          properties: {
            programming_languages: { type: "array", items: { type: "string" } },
            tools: { type: "array", items: { type: "string" } }
          }
        }
      },
      required: ["name", "email", "phone", "tenth_percentage", "twelfth_percentage", "degree_percentage_or_cgpa", "experience", "skills"]
    };

    const systemPrompt = `Extract resume details from the provided text and return ONLY valid JSON matching this exact schema:
${JSON.stringify(schema, null, 2)}

CRITICAL INSTRUCTIONS:
- tenth_percentage: Look for 10th/SSLC/SSC marks.
- twelfth_percentage: Look for 12th/PUC/HSC/2PU marks.
- degree_percentage_or_cgpa: Look for Graduation/Degree/B.E/B.Tech/B.Com marks. 
- DO NOT mix up 12th percentage with Degree CGPA. 
- If a value is missing, use "--".
- Return ONLY the JSON object. No markdown.`;

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      response_format: { type: "json_object" },
      temperature: 0.0,
    });

    const parsedJson = JSON.parse(completion.choices[0].message.content || "{}");

    // Map to final result
    const result = {
      name: parsedJson.name || "--",
      email: parsedJson.email || "--",
      phone: parsedJson.phone || "--",
      experience: parsedJson.experience?.map((exp: any) => exp.company ? `${exp.title} @ ${exp.company}` : exp.title) || [],
      tenth_percentage: parsedJson.tenth_percentage || "--",
      twelfth_percentage: parsedJson.twelfth_percentage || "--",
      degree_percentage_or_cgpa: parsedJson.degree_percentage_or_cgpa || "--",
    };

    // Final check: if LLM failed to find something, try the fallback regex
    if (result.tenth_percentage === "--" || result.twelfth_percentage === "--" || result.degree_percentage_or_cgpa === "--") {
      const fb = fallbackParse(text);
      if (result.tenth_percentage === "--") result.tenth_percentage = fb.tenth_percentage;
      if (result.twelfth_percentage === "--") result.twelfth_percentage = fb.twelfth_percentage;
      if (result.degree_percentage_or_cgpa === "--") result.degree_percentage_or_cgpa = fb.degree_percentage_or_cgpa;
    }

    return NextResponse.json(result);

  } catch (err: any) {
    console.error("Parse error:", err);
    return NextResponse.json({ error: err.message || "Failed to parse PDF" }, { status: 500 });
  }
}
