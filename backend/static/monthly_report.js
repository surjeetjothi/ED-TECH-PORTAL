/** monthly_report.js — Monthly Performance Report Logic */

async function initMonthlyReport() {
    console.log("[CB] Initializing Monthly Report...");

    // 1. Fetch Data
    try {
        const data = await cachedFetchAPI('/reports/summary', 60000); // 1 minute cache
        renderMonthlyReportData(data);
    } catch (error) {
        console.error("[CB] Failed to load monthly report data:", error);
        // Fallback or error UI
        document.getElementById('monthly-metrics-row').innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger shadow-sm border-0 rounded-4">
                    <span class="material-icons align-middle me-2">error_outline</span>
                    Failed to load report data. Please check your connection or try again later.
                </div>
            </div>
        `;
    }
}

function renderMonthlyReportData(data) {
    if (!data) return;

    // 2. Update Metric Cards
    updateMetricCard('monthly-att-rate', `${data.attendance_trends[data.attendance_trends.length - 1].rate}%`);
    updateMetricCard('monthly-aca-avg', `${data.academic_performance.overall_avg}/100`);

    // Find top subject
    const subjects = {
        'Math': data.academic_performance.math_avg,
        'Science': data.academic_performance.science_avg,
        'English': data.academic_performance.english_avg
    };
    const topSubject = Object.keys(subjects).reduce((a, b) => subjects[a] > subjects[b] ? a : b);
    updateMetricCard('monthly-top-subject', topSubject);
    updateMetricCard('monthly-staff-util', `${data.staff_utilization.utilization_rate}%`);

    // 3. Render Charts
    renderAttendanceChart(data.attendance_trends);
    renderAcademicChart(data.academic_performance);
}

function updateMetricCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderAttendanceChart(trends) {
    loadPlotlyAndRender(() => {
        const trace = {
            x: trends.map(t => t.month),
            y: trends.map(t => t.rate),
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: '#4D44B5', size: 8 },
            line: {
                shape: 'spline',
                width: 4,
                color: '#4D44B5'
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(77, 68, 181, 0.1)',
            name: 'Attendance %'
        };

        const layout = {
            autosize: true,
            margin: { t: 20, b: 40, l: 40, r: 20 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: {
                showgrid: false,
                linecolor: '#eee'
            },
            yaxis: {
                range: [0, 100],
                gridcolor: '#f5f5f5',
                zeroline: false
            },
            hovermode: 'closest'
        };

        const config = { displayModeBar: false, responsive: true };

        // Target both teacher and parent containers if they exist
        if (document.getElementById('monthly-attendance-chart')) {
            Plotly.newPlot('monthly-attendance-chart', [trace], layout, config);
        }
        if (document.getElementById('monthly-attendance-chart-parent')) {
            Plotly.newPlot('monthly-attendance-chart-parent', [trace], layout, config);
        }
    });
}

function renderAcademicChart(academic) {
    loadPlotlyAndRender(() => {
        const data = [
            {
                x: ['Math', 'Science', 'English'],
                y: [academic.math_avg, academic.science_avg, academic.english_avg],
                type: 'bar',
                marker: {
                    color: ['#FFC107', '#4CAF50', '#2196F3'],
                    line: { width: 0 }
                },
                width: 0.6
            }
        ];

        const layout = {
            autosize: true,
            margin: { t: 20, b: 40, l: 40, r: 20 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            xaxis: { showgrid: false },
            yaxis: {
                range: [0, 100],
                gridcolor: '#f5f5f5',
                zeroline: false
            }
        };

        const config = { displayModeBar: false, responsive: true };
        Plotly.newPlot('monthly-academic-chart', data, layout, config);
    });
}

// Bind to window for sidebar access
window.initMonthlyReport = initMonthlyReport;
