const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config({ quiet: true });

const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(process.env.HOME, 'Desktop', 'Screenshots');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llava:7b';
const WATCH_SETTLE_MS = Number(process.env.WATCH_SETTLE_MS || 1200);
const DEDUPE_WINDOW_MS = Number(process.env.DEDUPE_WINDOW_MS || 5000);
const VALID_SCREENSHOT_PREFIXES = ['Screenshot', 'Screen Shot'];

function isMacScreenshotName(fileName) {
    return VALID_SCREENSHOT_PREFIXES.some((prefix) => fileName.startsWith(prefix));
}

function sanitizeForFilename(value) {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function buildOutputFilename(appName, branch, aiSummary, ext) {
    const cleanAppName = appName.replace(/\s+/g, '-').toLowerCase();
    return `${cleanAppName}-${branch}-${aiSummary}${ext}`;
}

// 1. Helper to fetch the Active Application Name & Window Title on macOS
function getActiveWindowInfo() {
    const appleScript = `
        tell application "System Events"
            set frontmostProcess to first process where it is frontmost
            set appName to name of frontmostProcess
            try
                tell process appName
                    set windowName to name of first window
                end tell
            on error
                set windowName to ""
            end try
            return appName & "|||" & windowName
        end tell
    `;
    try {
        const output = execSync(`osascript -e '${appleScript}'`, { encoding: 'utf-8' }).trim();
        const [appName, windowTitle] = output.split('|||');
        return { 
            appName: appName || "UnknownApp", 
            windowTitle: windowTitle ? windowTitle.replace(/[^a-zA-Z0-9\s-_]/g, '') : "Workspace" 
        };
    } catch (err) {
        return { appName: "Desktop", windowTitle: "Screen" };
    }
}

// 2. Helper to fetch current Git branch if you are working in a repo folder
function getGitBranch() {
    // This looks at your current active folder in the window title if it contains a path
    // For simplicity, we can default or dynamically parse. Let's provide a baseline:
    try {
        const branch = execSync('git branch --show-current 2>/dev/null', { encoding: 'utf-8' }).trim();
        return branch || 'no-branch';
    } catch {
        return 'main';
    }
}

// 3. Contact Local Ollama instance to analyze the screenshot
async function analyzeImageWithOllama(filePath, appContext) {
    try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');

        console.log(`🧠 Sending to Ollama (${OLLAMA_MODEL}) with context: ${appContext}...`);

        const response = await axios.post(OLLAMA_URL, {
            model: OLLAMA_MODEL,
            prompt: `This is a screenshot taken while working in ${appContext}. Briefly describe exactly what is happening in this image in 5 words or less, separated by hyphens. Do not include spaces, periods, or capitals. Example: flexbox-layout-bug-alignment`,
            stream: false,
            images: [base64Image]
        });

        let description = response.data.response.trim().toLowerCase();
        // Clean up the output to make it safe for filenames
        description = sanitizeForFilename(description);
        return description || 'screenshot-summary';
    } catch (error) {
        console.error('❌ Ollama analysis failed:', error.message);
        return 'analyzed-image';
    }
}

const processingFiles = new Set();
const recentProcessTimes = new Map();

function shouldSkipDueToDedupe(filePath, now = Date.now()) {
    const previous = recentProcessTimes.get(filePath);
    if (!previous) return false;
    return now - previous < DEDUPE_WINDOW_MS;
}

async function processScreenshot(filePath, deps = {}) {
    const getContext = deps.getActiveWindowInfo || getActiveWindowInfo;
    const getBranch = deps.getGitBranch || getGitBranch;
    const analyze = deps.analyzeImageWithOllama || analyzeImageWithOllama;
    const renameFile = deps.renameSync || fs.renameSync;
    const addTags = deps.addTags || ((destinationPath, spotlightTags) => {
        execSync(`tag --add "${spotlightTags}" "${destinationPath}"`);
    });

    // Only capture actual png/jpg screenshots
    if (!['.png', '.jpg', '.jpeg'].includes(path.extname(filePath).toLowerCase())) return;
    
    // Check standard macOS naming schemes to avoid infinite loops on renames
    const baseName = path.basename(filePath);
    if (!isMacScreenshotName(baseName)) return;
    if (processingFiles.has(filePath)) return;
    if (shouldSkipDueToDedupe(filePath)) return;

    processingFiles.add(filePath);
    recentProcessTimes.set(filePath, Date.now());

    console.log(`\n📸 New Screenshot Detected: ${path.basename(filePath)}`);

    // Get live macOS focus states instantly
    const { appName, windowTitle } = getContext();
    const branch = getBranch();
    const appContext = `${appName} - ${windowTitle}`;

    // Run AI analysis
    const aiSummary = await analyze(filePath, appContext);

    // Build the new clean filename
    const ext = path.extname(filePath);
    const newFileName = buildOutputFilename(appName, branch, aiSummary, ext);
    const destinationPath = path.join(path.dirname(filePath), newFileName);

    try {
        // Rename the file
        renameFile(filePath, destinationPath);
        console.log(`✅ Renamed to: ${newFileName}`);
    } catch (err) {
        console.error('❌ Failed processing file rename:', err);
        return;
    }

    try {
        const spotlightTags = `${appName},${aiSummary},AutoGenerated`;
        addTags(destinationPath, spotlightTags);
        console.log(`🏷️  Injected Spotlight Tags: [${spotlightTags}]`);
    } catch (err) {
        console.error('⚠️ Renamed file but failed to apply tags:', err.message);
    } finally {
        processingFiles.delete(filePath);
    }
}

function startWatcher() {
    console.log(`🤖 Watcher active! Monitoring: ${SCREENSHOT_DIR}`);

    const watcher = fs.watch(SCREENSHOT_DIR, (eventType, filename) => {
        if (!filename || (eventType !== 'rename' && eventType !== 'change')) return;

        const filePath = path.join(SCREENSHOT_DIR, filename.toString());

        // Allow macOS screenshot write/rename sequence to settle before processing.
        setTimeout(() => {
            if (!fs.existsSync(filePath)) return;
            processScreenshot(filePath);
        }, WATCH_SETTLE_MS);
    });

    watcher.on('error', (err) => {
        console.error('❌ Watcher error:', err.message);
        console.error('Try restarting the watcher if this continues.');
    });

    return watcher;
}

module.exports = {
    SCREENSHOT_DIR,
    OLLAMA_URL,
    OLLAMA_MODEL,
    isMacScreenshotName,
    sanitizeForFilename,
    buildOutputFilename,
    shouldSkipDueToDedupe,
    processScreenshot,
    startWatcher
};

if (require.main === module) {
    const watcher = startWatcher();
    process.on('SIGINT', () => {
        watcher.close();
        console.log('\n👋 Watcher stopped cleanly.');
        process.exit(0);
    });
}