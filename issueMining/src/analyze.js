const fs = require('fs');
const path = require('path');
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');

// Input and output file paths
const inputFilePath = path.join(dataDir, 'classifications.csv');
const outputFilePath = path.join(dataDir, 'classification_stats.csv');

// Read and parse the input CSV file, skipping the header
const data = fs.readFileSync(inputFilePath, 'utf-8').trim().split('\n').slice(1);

const stats = {}; // Object to hold classification counts
let total = 0;     // Total number of valid classifications

// Count occurrences of each classification label
for (let line of data) {
    const [, classification] = line.split(',');

    if (!classification) continue;

    stats[classification] = (stats[classification] || 0) + 1;
    total++;
}

// Prepare CSV content for the output
// Format: label,count,percentage
const header = 'label,count,percentage';
const rows = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => {
        const percent = ((count / total) * 100).toFixed(1);
        return `${label},${count},${percent}%`;
    });

rows.push(`Total,${total},100%`);

// Write the results to a new CSV file
fs.writeFileSync(outputFilePath, [header, ...rows].join('\n'), 'utf-8');
