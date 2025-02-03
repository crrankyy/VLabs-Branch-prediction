import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Play, Pause, SkipForward, RotateCcw, Sun, Moon, Check, X } from 'lucide-react';

const PipelineStages = ['IF', 'ID', 'EX', 'MEM', 'WB'];

const sampleProgram = [
  { id: 1, instruction: 'ADD R1, R2, R3', type: 'alu', cycles: 1 },
  { id: 2, instruction: 'BEQ R1, R0, LABEL1', type: 'branch', cycles: 1, target: 5 },
  { id: 3, instruction: 'SUB R4, R5, R6', type: 'alu', cycles: 1 },
  { id: 4, instruction: 'MUL R7, R8, R9', type: 'alu', cycles: 1 },
  { id: 5, instruction: 'LABEL1: ADD R10, R11, R12', type: 'alu', cycles: 1 },
  { id: 6, instruction: 'BNE R4, R0, LABEL2', type: 'branch', cycles: 1, target: 8 },
  { id: 7, instruction: 'DIV R13, R14, R15', type: 'alu', cycles: 1 },
  { id: 8, instruction: 'LABEL2: SUB R16, R17, R18', type: 'alu', cycles: 1 }
];

const BranchPredictionPipeline = () => {
  const [predictionType, setPredictionType] = useState('one-bit');
  const [currentCycle, setCurrentCycle] = useState(0);
  const [executionHistory, setExecutionHistory] = useState(
    Array(sampleProgram.length).fill().map(() => Array(20).fill(''))
  );
  const [predictionHistory, setPredictionHistory] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [predictorState, setPredictorState] = useState({
    oneBit: 'NT',
    twoBit: 'SNT'
  });

  const branchOutcomes = {
    2: { taken: true, actualTarget: 5 },
    6: { taken: false, actualTarget: 8 }
  };

  const themeClasses = {
    container: isDarkMode ? 'bg-gray-900 text-white' : 'bg-white text-black',
    card: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white',
    table: {
      header: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200',
      cell: isDarkMode ? 'border-gray-700' : 'border-gray-200',
      branchRow: isDarkMode ? 'bg-blue-900/20' : 'bg-blue-50',
      stall: isDarkMode ? 'bg-red-900/20 text-red-300' : 'bg-red-100 text-red-700',
      misprediction: isDarkMode ? 'bg-yellow-900/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700'
    }
  };

  const getPrediction = (branchId) => {
    if (predictionType === 'one-bit') {
      return predictorState.oneBit === 'T';
    }
    return ['WT', 'ST'].includes(predictorState.twoBit);
  };

  const updatePipeline = () => {
    if (currentCycle >= 19) return;
    
    const newHistory = executionHistory.map(row => [...row]);
    const newPredictions = [...predictionHistory];
    let stallCycle = -1;

    // Check for branches in current cycle
    const currentInst = sampleProgram[currentCycle];
    if (currentInst?.type === 'branch') {
      const prediction = getPrediction(currentInst.id);
      const actual = branchOutcomes[currentInst.id]?.taken;
      
      newPredictions.push({
        cycle: currentCycle,
        instruction: currentInst.id,
        predicted: prediction ? 'T' : 'NT',
        actual: actual ? 'T' : 'NT',
        correct: prediction === actual
      });
    }

    // Handle stalls from mispredictions
    for (let i = 0; i < sampleProgram.length; i++) {
      const inst = sampleProgram[i];
      if (inst.type === 'branch') {
        const predicted = getPrediction(inst.id);
        const actual = branchOutcomes[inst.id]?.taken;
        const executionStart = i;
        
        if (actual !== undefined && predicted !== actual) {
          if (currentCycle >= executionStart + 2 && currentCycle <= executionStart + 4) {
            stallCycle = i;
          }
        }
      }
    }

    // Update pipeline stages
    for (let i = 0; i < sampleProgram.length; i++) {
      if (i <= currentCycle) {
        const stage = currentCycle - i;
        if (stage < PipelineStages.length) {
          if (stallCycle !== -1 && i > stallCycle) {
            newHistory[i][currentCycle] = 'STALL';
          } else {
            newHistory[i][currentCycle] = PipelineStages[stage];
          }
        }
      }
    }

    setExecutionHistory(newHistory);
    setPredictionHistory(newPredictions);
    setCurrentCycle(prev => prev + 1);

    // Update predictor state
    if (currentInst?.type === 'branch') {
      const outcome = branchOutcomes[currentInst.id];
      if (outcome) {
        if (predictionType === 'one-bit') {
          setPredictorState(prev => ({
            ...prev,
            oneBit: outcome.taken ? 'T' : 'NT'
          }));
        } else {
          const transitions = {
            SNT: outcome.taken ? 'WNT' : 'SNT',
            WNT: outcome.taken ? 'WT' : 'SNT',
            WT: outcome.taken ? 'ST' : 'WNT',
            ST: outcome.taken ? 'ST' : 'WT'
          };
          setPredictorState(prev => ({
            ...prev,
            twoBit: transitions[prev.twoBit]
          }));
        }
      }
    }
  };

  const reset = () => {
    setCurrentCycle(0);
    setExecutionHistory(Array(sampleProgram.length).fill().map(() => Array(20).fill('')));
    setPredictionHistory([]);
    setIsRunning(false);
    setPredictorState({
      oneBit: 'NT',
      twoBit: 'SNT'
    });
  };

  return (
    <div className={`w-full max-w-6xl mx-auto p-4 transition-colors duration-200 ${themeClasses.container}`}>
      <Card className={themeClasses.card}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Pipeline Execution with Branch Prediction</CardTitle>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={themeClasses.button}
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="one-bit" onValueChange={setPredictionType}>
            <TabsList className="mb-4">
              <TabsTrigger value="one-bit">One-Bit Predictor</TabsTrigger>
              <TabsTrigger value="two-bit">Two-Bit Predictor</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-4 mb-4">
            <Button onClick={() => setIsRunning(!isRunning)} className="flex items-center gap-2">
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {isRunning ? 'Pause' : 'Start'}
            </Button>
            <Button onClick={updatePipeline} className="flex items-center gap-2">
              <SkipForward className="w-4 h-4" /> Step
            </Button>
            <Button onClick={reset} variant="outline" className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" /> Reset
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className={themeClasses.table.header}>
                  <tr>
                    <th className={`border p-2 text-left ${themeClasses.table.cell}`}>Instruction</th>
                    {Array.from({ length: 20 }, (_, i) => (
                      <th key={i} className={`border p-2 text-center ${themeClasses.table.cell}`}>
                        Cycle {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleProgram.map((inst, idx) => (
                    <tr key={inst.id} className={inst.type === 'branch' ? themeClasses.table.branchRow : ''}>
                      <td className={`border p-2 font-mono ${themeClasses.table.cell}`}>
                        {inst.instruction}
                      </td>
                      {executionHistory[idx].map((stage, cycleIdx) => (
                        <td 
                          key={cycleIdx} 
                          className={`border p-2 text-center ${themeClasses.table.cell} ${
                            stage === 'STALL' ? themeClasses.table.stall : ''
                          }`}
                        >
                          {stage}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:col-span-1">
              <div className="border rounded p-4 mb-4">
                <h3 className="font-semibold mb-2">Branch Prediction History</h3>
                <div className="space-y-2">
                  {predictionHistory.map((pred, idx) => (
                    <div key={idx} className={`p-2 rounded flex items-center justify-between ${
                      pred.correct ? 
                        (isDarkMode ? 'bg-green-900/20 text-green-300' : 'bg-green-100 text-green-700') :
                        themeClasses.table.misprediction
                    }`}>
                      <span>Cycle {pred.cycle}: Branch {pred.instruction}</span>
                      <div className="flex items-center gap-2">
                        <span>P: {pred.predicted}</span>
                        <span>A: {pred.actual}</span>
                        {pred.correct ? 
                          <Check className="w-4 h-4 text-green-500" /> : 
                          <X className="w-4 h-4 text-red-500" />
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border rounded p-4">
                <h3 className="font-semibold mb-2">Current Predictor State:</h3>
                <div className="space-y-2">
                  <div className={`p-2 rounded ${
                    predictionType === 'one-bit' 
                      ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100')
                      : (isDarkMode ? 'bg-gray-700' : 'bg-gray-100')
                  }`}>
                    One-bit: {predictorState.oneBit}
                  </div>
                  <div className={`p-2 rounded ${
                    predictionType === 'two-bit'
                      ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100')
                      : (isDarkMode ? 'bg-gray-700' : 'bg-gray-100')
                  }`}>
                    Two-bit: {predictorState.twoBit}
                  </div>
                </div>
              </div>

              <div className="border rounded p-4 mt-4">
                <h3 className="font-semibold mb-2">Statistics:</h3>
                <div className="space-y-1">
                  <p>Current Cycle: {currentCycle}</p>
                  <p>Branch Instructions: {Object.keys(branchOutcomes).length}</p>
                  <p>Pipeline Stalls: {executionHistory.flat().filter(stage => stage === 'STALL').length}</p>
                  <p>Mispredictions: {predictionHistory.filter(p => !p.correct).length}</p>
                  <p>Prediction Accuracy: {
                    predictionHistory.length > 0 
                      ? `${((predictionHistory.filter(p => p.correct).length / predictionHistory.length) * 100).toFixed(1)}%`
                      : '0%'
                  }</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BranchPredictionPipeline;