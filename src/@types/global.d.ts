declare global {
  var gc: () => void;
  namespace NodeJS {
    interface Process {
      report: {
        getReport: () => any;
        writeReport: (filename?: string) => void;
      };
    }
  }
}

export {}; 