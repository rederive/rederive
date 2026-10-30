# Frozen oracle for quorum — worked input -> output; reproduce EXACTLY. 21 shown; 48 more are HELD OUT.
  quorum([], 0) => throw("quorum: need must be an integer >= 1 (got 0)")
  quorum([], -1) => throw("quorum: need must be an integer >= 1 (got -1)")
  quorum([true,true,true], 0) => throw("quorum: need must be an integer >= 1 (got 0)")
  quorum([false,true,true], -3) => throw("quorum: need must be an integer >= 1 (got -3)")
  quorum([], -9007199254740991) => throw("quorum: need must be an integer >= 1 (got -9007199254740991)")
  quorum([], 1) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([], 2) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([], 9007199254740991) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([false], 1) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([false,false,false], 1) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([false,false,false], 3) => {fullCount:0, hasQuorum:false, winnerIdx:-1}
  quorum([true], 1) => {fullCount:1, hasQuorum:true, winnerIdx:0}
  quorum([true], 2) => {fullCount:1, hasQuorum:false, winnerIdx:-1}
  quorum([true,true,true], 2) => {fullCount:3, hasQuorum:true, winnerIdx:0}
  quorum([true,true,true], 3) => {fullCount:3, hasQuorum:true, winnerIdx:0}
  quorum([true,true,true], 4) => {fullCount:3, hasQuorum:false, winnerIdx:-1}
  quorum([false,true,true], 2) => {fullCount:2, hasQuorum:true, winnerIdx:1}
  quorum([false,false,true,true], 1) => {fullCount:2, hasQuorum:true, winnerIdx:2}
  quorum([false,true,false,true], 2) => {fullCount:2, hasQuorum:true, winnerIdx:1}
  quorum([false,true,false,true], 3) => {fullCount:2, hasQuorum:false, winnerIdx:-1}
  quorum([true,false], 1) => {fullCount:1, hasQuorum:true, winnerIdx:0}
