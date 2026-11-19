import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

interface PlotlyChartProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  className?: string;
  height?: number;
  showGrid?: boolean;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout = {},
  config = {},
  className = '',
  height = 240,
  showGrid = true,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const baseAxis = {
      showgrid: showGrid,
      gridcolor: '#E7E2D7',
      zerolinecolor: '#C7C1B4',
      linecolor: '#D8D3C7',
      mirror: true,
      tickfont: { family: '"IBM Plex Mono", monospace', size: 10, color: '#6A6F75' },
    };

    const mergedLayout: Partial<Plotly.Layout> = {
      paper_bgcolor: '#FBFAF6',
      plot_bgcolor: '#FBFAF6',
      font: {
        family: '"IBM Plex Sans", system-ui, sans-serif',
        color: '#1E2226',
        size: 11,
      },
      margin: { l: 56, r: 18, t: 26, b: 42 },
      height,
      autosize: true,
      xaxis: { ...baseAxis, ...layout.xaxis },
      yaxis: { ...baseAxis, ...layout.yaxis },
      legend: {
        orientation: 'h',
        yanchor: 'bottom',
        y: 1.02,
        xanchor: 'right',
        x: 1,
        font: { family: '"IBM Plex Sans", sans-serif', size: 10.5, color: '#1E2226' },
        bgcolor: 'rgba(251, 250, 246, 0.9)',
        ...layout.legend,
      },
      hoverlabel: {
        bgcolor: '#FBFAF6',
        bordercolor: '#1E2226',
        font: { family: '"IBM Plex Mono", monospace', size: 11, color: '#1E2226' },
      },
      ...layout,
    };

    if (layout.xaxis) {
      mergedLayout.xaxis = { ...baseAxis, ...layout.xaxis };
    }
    if (layout.yaxis) {
      mergedLayout.yaxis = { ...baseAxis, ...layout.yaxis };
    }

    const mergedConfig: Partial<Plotly.Config> = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      ...config,
    };

    Plotly.react(el, data, mergedLayout, mergedConfig);
  }, [data, layout, config, height, showGrid]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el) {
        Plotly.Plots.resize(el);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (el) {
        Plotly.purge(el);
      }
    };
  }, []);

  return <div ref={containerRef} className={`w-full overflow-hidden ${className}`} />;
};
