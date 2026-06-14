function analyzeClassifications(classifications) {
    const stats = {};
    let total = 0;

    // classifications: { issueNumber: "fixed_by_devs" | "inactivity" | "other" }
    for (const issueId of Object.keys(classifications)) {
        const classification = classifications[issueId];

        if (!classification) continue;

        stats[classification] = (stats[classification] || 0) + 1;
        total++;
    }

    const rows = Object.entries(stats)
        .sort((a, b) => b[1] - a[1])
        .map(([label, count]) => {
            const percent = ((count / total) * 100).toFixed(1);
            return {
                label,
                count,
                percentage: `${percent}%`
            };
        });

    rows.push({
        label: "Total",
        count: total,
        percentage: "100%"
    });

    return {
        total,
        stats,
        breakdown: rows
    };
}

export default analyzeClassifications;
