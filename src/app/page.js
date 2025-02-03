"use client";

import BranchPredictionPipeline from '@/components/ui/BranchPredictionPipeline'
import PipelineVisualizer from '@/components/ui/pipeline-visualization';

export default function Home() {
  return (
    <main className="min-h-screen p-4">
      <PipelineVisualizer />
    </main>
  )
}