import React, { useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const PipelineVisualizer = () => {
  // State for the current predictor type
  const [predictorType, setPredictorType] = useState('one-bit');
  
  // State for one-bit predictor
  const [oneBitState, setOneBitState] = useState('NT');
  
  // State for two-bit predictor
  const [twoBitState, setTwoBitState] = useState('00');
  
  // Sample instruction sequence demonstrating branch prediction patterns
  const [instructions] = useState([
    // Loop initialization
    { id: 1, type: 'add', text: 'add r1, r0, #5', comment: 'Initialize loop counter' },
    
    // First iteration - Loop will be taken 4 times (T,T,T,T)
    { id: 2, type: 'add', text: 'LOOP: add r2, r2, r3', comment: 'Loop body' },
    { id: 3, type: 'sub', text: 'sub r1, r1, #1', comment: 'Decrement counter' },
    { id: 4, type: 'branch', text: 'bne r1, r0, LOOP', actual: 'T', comment: 'First branch: Taken', dependsOn: [3] },
    
    // Second iteration
    { id: 5, type: 'add', text: 'add r2, r2, r3', comment: 'Loop iteration 2' },
    { id: 6, type: 'sub', text: 'sub r1, r1, #1', comment: 'Decrement counter' },
    { id: 7, type: 'branch', text: 'bne r1, r0, LOOP', actual: 'T', comment: 'Second branch: Taken', dependsOn: [6] },
    
    // Third iteration
    { id: 8, type: 'add', text: 'add r2, r2, r3', comment: 'Loop iteration 3' },
    { id: 9, type: 'sub', text: 'sub r1, r1, #1', comment: 'Decrement counter' },
    { id: 10, type: 'branch', text: 'bne r1, r0, LOOP', actual: 'T', comment: 'Third branch: Taken', dependsOn: [9] },
    
    // Fourth iteration
    { id: 11, type: 'add', text: 'add r2, r2, r3', comment: 'Loop iteration 4' },
    { id: 12, type: 'sub', text: 'sub r1, r1, #1', comment: 'Decrement counter' },
    { id: 13, type: 'branch', text: 'bne r1, r0, LOOP', actual: 'T', comment: 'Fourth branch: Taken', dependsOn: [12] },
    
    // Final iteration - Loop exits (NT)
    { id: 14, type: 'add', text: 'add r2, r2, r3', comment: 'Final iteration' },
    { id: 15, type: 'sub', text: 'sub r1, r1, #1', comment: 'Counter reaches zero' },
    { id: 16, type: 'branch', text: 'bne r1, r0, LOOP', actual: 'NT', comment: 'Final branch: Not Taken', dependsOn: [15] },
    
    // Post-loop instruction
    { id: 17, type: 'add', text: 'add r4, r2, r0', comment: 'Post-loop operation' }
  ]);
  
  // Current cycle and pipeline state
  const [currentCycle, setCurrentCycle] = useState(1);
  const [maxCycle, setMaxCycle] = useState(1);
  const [pipelineState, setPipelineState] = useState(new Map());
  const [stallState, setStallState] = useState(new Map());
  
  // Statistics
  const [stats, setStats] = useState({
    correct: 0,
    incorrect: 0,
    dataStalls: 0,
    branchStalls: 0
  });

  // Check if all instructions have completed
  const isExecutionComplete = () => {
    return instructions.every(inst => {
      const state = pipelineState.get(inst.id);
      return state && state.W; // Check if instruction has completed writeback
    });
  };

  // Get prediction based on current state
  const getPrediction = () => predictorType === 'one-bit' ? oneBitState : twoBitState.startsWith('1') ? 'T' : 'NT';

  // Update predictor state based on actual outcome
  const updateState = (actual) => {
    if (predictorType === 'one-bit') {
      setOneBitState(actual);
    } else {
      const currentVal = parseInt(twoBitState, 2);
      let newVal = actual === 'T' ? Math.min(currentVal + 1, 3) : Math.max(currentVal - 1, 0);
      setTwoBitState(newVal.toString(2).padStart(2, '0'));
    }
  };

  // Check for data hazards
  const hasDataHazard = (inst, cycle) => {
    if (!inst.dependsOn) return false;
    
    return inst.dependsOn.some(depId => {
      const depInst = pipelineState.get(depId);
      return depInst && !depInst.W && depInst.F < cycle;
    });
  };

  // Step one cycle
  const step = () => {
    // Don't proceed if all instructions have completed
    if (isExecutionComplete()) return;

    let newPipelineState = new Map(pipelineState);
    let newStallState = new Map(stallState);
    let newDataStalls = 0;
    let newBranchStalls = 0;

    // Process each instruction
    instructions.forEach((inst, index) => {
      const instState = newPipelineState.get(inst.id) || {};
      const stallInfo = newStallState.get(inst.id) || {};

      // Check if instruction can start
      if (!instState.F && canStartInstruction(index, newPipelineState)) {
        instState.F = currentCycle;
      }

      // If instruction has started, process through pipeline
      if (instState.F) {
        // Check for data hazards before decode
        if (!instState.D && instState.F < currentCycle) {
          if (hasDataHazard(inst, currentCycle)) {
            stallInfo[currentCycle] = 'D'; // Data hazard stall
            newDataStalls++;
          } else {
            instState.D = currentCycle;
          }
        }

        // Progress through other stages
        if (!instState.E && instState.D && instState.D < currentCycle) {
          instState.E = currentCycle;
        }
        if (!instState.M && instState.E && instState.E < currentCycle) {
          instState.M = currentCycle;
        }
        if (!instState.W && instState.M && instState.M < currentCycle) {
          instState.W = currentCycle;
        }

        // Handle branch misprediction
        if (inst.type === 'branch' && instState.E === currentCycle) {
          const prediction = getPrediction();
          const correct = prediction === inst.actual;

          if (!correct) {
            // Mark branch stalls
            stallInfo[currentCycle + 1] = 'B';
            stallInfo[currentCycle + 2] = 'B';
            newBranchStalls += 2;
            
            // Flush pipeline
            flushPipeline(index, newPipelineState);
          }

          updateState(inst.actual);
          setStats(prev => ({
            ...prev,
            correct: prev.correct + (correct ? 1 : 0),
            incorrect: prev.incorrect + (correct ? 0 : 1)
          }));
        }
      }

      newPipelineState.set(inst.id, instState);
      newStallState.set(inst.id, stallInfo);
    });

    setPipelineState(newPipelineState);
    setStallState(newStallState);
    setCurrentCycle(prev => prev + 1);
    setMaxCycle(prev => Math.max(prev, currentCycle + 1));
    
    setStats(prev => ({
      ...prev,
      dataStalls: prev.dataStalls + newDataStalls,
      branchStalls: prev.branchStalls + newBranchStalls
    }));
  };

  // Helper to check if an instruction can start
  const canStartInstruction = (index, state) => {
    if (index === 0) return true;
    const prevInst = instructions[index - 1];
    const prevState = state.get(prevInst.id);
    return prevState && prevState.D;
  };

  // Helper to flush pipeline after branch misprediction
  const flushPipeline = (branchIndex, state) => {
    instructions.forEach((inst, index) => {
      if (index > branchIndex) {
        state.delete(inst.id);
      }
    });
  };

  // Reset simulation
  const reset = () => {
    setCurrentCycle(1);
    setMaxCycle(1);
    setPipelineState(new Map());
    setStallState(new Map());
    setOneBitState('NT');
    setTwoBitState('00');
    setStats({ correct: 0, incorrect: 0, dataStalls: 0, branchStalls: 0 });
  };

  // Helper to determine pipeline stage at a given cycle
  const getStageAtCycle = (instState, cycle) => {
    if (instState.W === cycle) return 'W';
    if (instState.M === cycle) return 'M';
    if (instState.E === cycle) return 'E';
    if (instState.D === cycle) return 'D';
    if (instState.F === cycle) return 'F';
    return '';
  };

  // Helper to get stage color
  const getStageColor = (stage, stall) => {
    if (stall) return 'bg-gray-200';
    switch (stage) {
      case 'F': return 'bg-blue-100';
      case 'D': return 'bg-green-100';
      case 'E': return 'bg-yellow-100';
      case 'M': return 'bg-orange-100';
      case 'W': return 'bg-red-100';
      default: return '';
    }
  };

  return (
    <div className="w-full max-w-[90rem] mx-auto p-4 md:p-6">
      <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-6">Pipeline Stage Visualization with Stalls</h1>
      
      {/* Predictor Controls */}
      <div className="mb-4 md:mb-6 p-3 md:p-4 border rounded bg-gray-50 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-sm md:text-base">Predictor Type:</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm md:text-base ${predictorType === 'one-bit' ? 'text-blue-600' : 'text-gray-500'}`}>One-Bit</span>
            <button
              onClick={() => setPredictorType(prev => prev === 'one-bit' ? 'two-bit' : 'one-bit')}
              className="relative inline-flex h-5 md:h-6 w-10 md:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              style={{
                backgroundColor: predictorType === 'two-bit' ? '#3B82F6' : '#D1D5DB'
              }}
            >
              <span
                className={`${
                  predictorType === 'two-bit' ? 'translate-x-5 md:translate-x-6' : 'translate-x-1'
                } inline-block h-3 md:h-4 w-3 md:w-4 transform rounded-full bg-white transition-transform`}
              />
            </button>
            <span className={`text-sm md:text-base ${predictorType === 'two-bit' ? 'text-blue-600' : 'text-gray-500'}`}>Two-Bit</span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <span className="font-semibold text-sm md:text-base">Current State:</span>
          {predictorType === 'one-bit' ? (
            <div className="flex gap-4 text-sm md:text-base">
              <p>State: {oneBitState}</p>
              <p>Prediction: {oneBitState}</p>
            </div>
          ) : (
            <div className="flex gap-4 text-sm md:text-base">
              <p>State: {twoBitState} ({
                twoBitState === '00' ? 'Strong NT' :
                twoBitState === '01' ? 'Weak NT' :
                twoBitState === '10' ? 'Weak T' : 'Strong T'
              })</p>
              <p>Prediction: {twoBitState.startsWith('1') ? 'T' : 'NT'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 md:mb-6 flex gap-4">
        <button
          onClick={step}
          disabled={isExecutionComplete()}
          className="px-3 md:px-4 py-2 text-sm md:text-base bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Step Cycle{isExecutionComplete() ? ' (Complete)' : ''}
        </button>
        <button
          onClick={reset}
          className="px-3 md:px-4 py-2 text-sm md:text-base bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Reset
        </button>
      </div>

      {/* Pipeline Visualization */}
      <div className="mb-4 md:mb-6 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-2">Pipeline Stages</h2>
          <table className="w-auto border-collapse text-sm md:text-base whitespace-nowrap">
            <thead>
              <tr>
                <th className="border p-2 md:p-3 w-[18rem]">Instruction</th>
                <th className="border p-2 md:p-3 w-[10rem]">Comment</th>
                {[...Array(maxCycle)].map((_, i) => (
                  <th key={i} className="border p-2 md:p-3 w-8 md:w-12">{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructions.map(inst => (
                <tr key={inst.id}>
                  <td className="border p-2 md:p-3 font-mono whitespace-nowrap max-w-[18rem] overflow-hidden text-ellipsis">{inst.text}</td>
                  <td className="border p-2 md:p-3 text-xs md:text-sm text-gray-600 max-w-[20rem] overflow-hidden text-ellipsis">{inst.comment || ''}</td>
                  {[...Array(maxCycle)].map((_, cycle) => {
                    const instState = pipelineState.get(inst.id) || {};
                    const stallInfo = stallState.get(inst.id) || {};
                    const stage = getStageAtCycle(instState, cycle + 1);
                    const stall = stallInfo[cycle + 1];
                    
                    return (
                      <td 
                        key={cycle}
                        className={`border p-1 md:p-2 text-center ${getStageColor(stage, stall)}`}
                      >
                        {stall ? `S${stall}` : stage}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {/* Statistics */}
      <div className="mb-4 md:mb-6 p-3 md:p-4 border rounded bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm md:text-base">
          <p>Current Cycle: {currentCycle}</p>
          <p>Branch Predictions: {stats.correct} correct, {stats.incorrect} incorrect</p>
          <p>Stalls: {stats.dataStalls} data hazard, {stats.branchStalls} branch misprediction</p>
          <p>Total Stall Cycles: {stats.dataStalls + stats.branchStalls}</p>
          <p>Prediction Accuracy: {
            stats.correct + stats.incorrect > 0 
              ? ((stats.correct / (stats.correct + stats.incorrect)) * 100).toFixed(1) + '%'
              : '0%'
          }</p>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 md:mt-6 p-3 md:p-4 border rounded">
        <h2 className="text-lg font-semibold mb-2">Legend</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm md:text-base">
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-blue-100 mr-2"></div>
            <span>Fetch (F)</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-green-100 mr-2"></div>
            <span>Decode (D)</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-yellow-100 mr-2"></div>
            <span>Execute (E)</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-orange-100 mr-2"></div>
            <span>Memory (M)</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-red-100 mr-2"></div>
            <span>Writeback (W)</span>
          </div>
          <div className="flex items-center">
            <div className="w-5 md:w-6 h-5 md:h-6 bg-gray-200 mr-2"></div>
            <span>Stall (SD/SB)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipelineVisualizer;