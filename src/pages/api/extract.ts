import type { NextApiRequest, NextApiResponse } from "next";
import formidable, { Fields } from "formidable";
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

type ParsedFields = Fields;
type ParsedFiles = {
  file: formidable.File[];
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
            text: `You are a helpful assistant that extracts contact details from business card images.

Please extract the following and return ONLY in this exact JSON format:

{
  "company": "Company Name",
  "email": "someone@example.com",
  "phone": "+34 8493049",
  "name": "Alain",
  "designation": "Marketing Manager"
}

Do not include any extra text or markdown. Only return valid JSON.`,
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
      phone: parsed.phone || "",
      name: parsed.name || "",
      designation: parsed.designation || "",
    };
  } catch {
    // fallback regex
    const companyMatch = raw.match(/"company"\s*:\s*"([^"]+)"/i);
    const emailMatch = raw.match(/"email"\s*:\s*"([^"]+)"/i);
    const phoneMatch = raw.match(/"phone"\s*:\s*"([^"]+)"/i);
    const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/i);
    const designationMatch = raw.match(/"designation"\s*:\s*"([^"]+)"/i);
    return {
      company: companyMatch?.[1] || "",
      email: emailMatch?.[1] || "",
      phone: phoneMatch?.[1] || "",
      name: nameMatch?.[1] || "",
      designation: designationMatch?.[1] || "",
    };
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const form = formidable({ multiples: false });

  const data: { fields: ParsedFields; files: ParsedFiles } = await new Promise(
    (resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) return reject(err);
        resolve({ fields, files: files as ParsedFiles });
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
      const { company, email, phone, name, designation } =
        await extractDetailsFromImage(row.image_url);
      return {
        ...row,
        company,
        email,
        phone,
        name,
        designation,
      };
    })
  );

  const csvHeader =
    "id,created_at,image_url,comment,company,email,phone,name,designation\n";
  const csvRows = enriched
    .map((row) =>
      [
        row.id,
        row.created_at,
        row.image_url,
        row.comment,
        row.company,
        row.email,
        row.phone,
        row.name,
        row.designation,
      ]
        .map((v) => `"${v}"`)
        .join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="enriched.csv"');
  res.status(200).send(csvHeader + csvRows);
}
