const { execSync } = require('child_process');
const axios = require('axios');
require('dotenv').config({ quiet: true });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava:7b';

async function run() {
    let hasFailure = false;

    console.log('Running health checks...');

    try {
        const response = await axios.get('http://localhost:11434/api/tags');
        const models = (response.data.models || []).map((m) => m.name);
        const hasModel = models.some((name) => name.startsWith(`${OLLAMA_MODEL}:`) || name === OLLAMA_MODEL);

        if (!hasModel) {
            hasFailure = true;
            console.error(`❌ Ollama is running but model "${OLLAMA_MODEL}" was not found.`);
            console.error(`   Install with: ollama pull ${OLLAMA_MODEL}`);
        } else {
            console.log(`✅ Ollama reachable and model "${OLLAMA_MODEL}" is available.`);
        }
    } catch (error) {
        hasFailure = true;
        console.error('❌ Ollama is not reachable on localhost:11434.');
        console.error('   Start with: ollama serve');
        console.error(`   Current OLLAMA_URL: ${OLLAMA_URL}`);
    }

    try {
        execSync('tag --version', { stdio: 'ignore' });
        console.log('✅ tag CLI is installed.');
    } catch {
        hasFailure = true;
        console.error('❌ tag CLI is not installed.');
        console.error('   Install with: brew install tag');
    }

    if (hasFailure) {
        process.exit(1);
    }

    console.log('✅ All health checks passed.');
}

run();
