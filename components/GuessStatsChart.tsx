"use client";

import * as d3 from "d3";
import { useEffect, useRef } from "react";

type Props = {
  pts: number;
  reb: number;
  ast: number;
};

export function GuessStatsChart({ pts, reb, ast }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const data = [
      { stat: "PTS", value: pts },
      { stat: "REB", value: reb },
      { stat: "AST", value: ast },
    ];

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 480;
    const height = 300;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.stat))
      .range([margin.left, width - margin.right])
      .padding(0.3);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value)!])
      .nice()
      .range([height - margin.bottom, margin.top]);

    const xAxis = (g: any) =>
      g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x));

    const yAxis = (g: any) =>
      g.attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y));

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);

    svg
      .append("g")
      .selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => x(d.stat)!)
      .attr("y", (d) => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", (d) => y(0) - y(d.value))
      .attr("fill", "steelblue");

    svg
      .append("g")
      .selectAll("text")
      .data(data)
      .join("text")
      .attr("x", (d) => x(d.stat)! + x.bandwidth() / 2)
      .attr("y", (d) => y(d.value) - 6)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("font-size", 13)
      .text((d) => d.value.toFixed(1));
  }, [pts, reb, ast]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 480 300"
      role="img"
      aria-label={`Player stats: ${pts} points, ${reb} rebounds, ${ast} assists per game`}
      className="w-full h-auto max-w-5xl mx-auto"
    />
  );
}
