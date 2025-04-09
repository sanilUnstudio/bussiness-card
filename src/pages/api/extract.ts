import formidable from "formidable";
import { readFile } from "fs/promises";
import { parse } from "papaparse";
import { OpenAI } from "openai";

export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type Row = {
  id: string;
  created_at: string;
  image_url: string;
  comment: string;
};

async function extractDetailsFromImage(imageUrl: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 400,
    temperature: 0.3,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a helpful assistant that extracts information from business card images.

Please extract only:
- Company name
- Email address

Respond ONLY in this exact JSON format:
{
  "company": "Company Name",
  "email": "someone@example.com"
}

Do not include any extra text, explanation, markdown, or formatting. Only return valid JSON.`,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  console.log("RAW GPT RESPONSE:", raw);

  try {
    const parsed = JSON.parse(raw);
    return {
      company: parsed.company || "",
      email: parsed.email || "",
    };
  } catch (err) {
    console.error("JSON parse error — trying fallback...");
    const companyMatch = raw.match(/"company"\s*:\s*"([^"]+)"/i);
    const emailMatch = raw.match(/"email"\s*:\s*"([^"]+)"/i);
    return {
      company: companyMatch?.[1] || "",
      email: emailMatch?.[1] || "",
    };
  }
}


export default async function handler(req, res) {
  const form = formidable({ multiples: false });

  const data = await new Promise<{ fields: any; files: any }>(
    (resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      });
    }
  );

  const file = data.files.file[0];
  const content = await readFile(file.filepath, "utf-8");

  const parsed = parse<Row>(content, {
    header: true,
    skipEmptyLines: true,
  });

  const enriched = await Promise.all(
    parsed.data.map(async (row) => {
      const { company, email } = await extractDetailsFromImage(row.image_url);
      return {
        ...row,
        company,
        email,
      };
    })
  );

  const csvHeader = "id,created_at,image_url,comment,company,email\n";
  const csvRows = enriched
    .map((row) =>
      [
        row.id,
        row.created_at,
        row.image_url,
        row.comment,
        row.company,
        row.email,
      ]
        .map((v) => `"${v}"`)
        .join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="enriched.csv"');
  res.status(200).send(csvHeader + csvRows);
}
