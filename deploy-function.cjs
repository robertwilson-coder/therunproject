const fs = require('fs');

// Read the function content
const content = fs.readFileSync('supabase/functions/generate-training-plan/index.ts', 'utf8');
const validatorContent = fs.readFileSync('supabase/functions/generate-training-plan/tip-validator.ts', 'utf8');

// Output as JSON that can be piped to the MCP tool
const payload = {
  name: "generate-training-plan",
  slug: "generate-training-plan",
  verify_jwt: true,
  entrypoint_path: "index.ts",
  files: [
    {
      name: "index.ts",
      content: content
    },
    {
      name: "tip-validator.ts",
      content: validatorContent
    }
  ]
};

console.log(JSON.stringify(payload));
