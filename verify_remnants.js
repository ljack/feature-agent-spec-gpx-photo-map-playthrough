const fs = require('fs');
const path = require('path');

console.log('=== Feature-Agent-Spec: Zero-Remnant Verification ===\n');

// 1. Load config.js content to find active features
const configPath = path.join(__dirname, 'config.js');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.js not found');
  process.exit(1);
}
const configContent = fs.readFileSync(configPath, 'utf8');

// Parse config.features section
const featuresSectionMatch = configContent.match(/features:\s*\{([^}]+)\}/);
if (!featuresSectionMatch) {
  console.error('Error: Could not find features section in config.js');
  process.exit(1);
}

const featuresText = featuresSectionMatch[1];
const featureLines = featuresText.split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('//'));

const features = {};
featureLines.forEach(line => {
  const match = line.match(/^(\w+)\s*:\s*(true|false)/);
  if (match) {
    features[match[1]] = match[2] === 'true';
  }
});

console.log('Registered Features found in config.js:');
console.log(features);
console.log('');

let violationsCount = 0;

// Scan rule: files in core/* and features/* (other than the target feature itself)
// must not contain references to the target feature.
function scanForRemnants(targetFeature) {
  const foldersToScan = ['core', 'features'];
  
  // Map config feature IDs to their actual folder names if they differ
  const folderMapping = {
    three_d_playthrough: '3d_playthrough'
  };
  const targetFolder = folderMapping[targetFeature] || targetFeature;

  // Match patterns like 'gallery' or /gallery/ but ignore simple words.
  const regex = new RegExp(`['"\\/\\.]${targetFeature}['"\\/]`, 'i');
  const foundReferences = [];

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip scanning the target feature folder itself
        if (dir === path.join(__dirname, 'features') && file === targetFolder) {
          continue;
        }
        scanDir(fullPath);
      } else if (file.endsWith('.js') || file.endsWith('.css')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (regex.test(content)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (regex.test(line)) {
              foundReferences.push({
                file: path.relative(__dirname, fullPath),
                line: idx + 1,
                content: line.trim()
              });
            }
          });
        }
      }
    }
  }

  foldersToScan.forEach(folder => {
    const dirPath = path.join(__dirname, folder);
    if (fs.existsSync(dirPath)) {
      scanDir(dirPath);
    }
  });

  return foundReferences;
}

for (const feature of Object.keys(features)) {
  console.log(`Verifying Zero-Remnant isolation for feature: "${feature}"...`);
  
  const refs = scanForRemnants(feature);
  if (refs.length > 0) {
    console.error(`❌ Violation found for feature "${feature}":`);
    refs.forEach(ref => {
      console.error(`   - File: ${ref.file}:${ref.line}`);
      console.error(`     Code: "${ref.content}"`);
    });
    violationsCount++;
  } else {
    console.log(`✅ Feature "${feature}" is fully isolated (Zero Remnants outside index.html/config.js).`);
  }
  console.log('');
}

if (violationsCount > 0) {
  console.error(`=== Verification FAILED: ${violationsCount} violation(s) detected. ===`);
  process.exit(1);
} else {
  console.log('=== Verification PASSED: All features are cleanly decoupled! ===');
  process.exit(0);
}
