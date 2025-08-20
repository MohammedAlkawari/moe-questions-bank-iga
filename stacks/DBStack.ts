import { Table, StackContext } from "sst/constructs";

export function DBStack({ stack, app }: StackContext) {
  // DynamoDB users table
  //Not used
  const users_table = new Table(stack, "Users", {
    fields: {
      email: "string",
      role: "string",
    },
    primaryIndex: { partitionKey: "email" },
  });

  // DynamoDB exams table
  const exams_table = new Table(stack, "Exams", {
    fields: {
      examID: "string",
      examState: "string",
      examClass: "string",
      examSubject: "string",
      examSemester: "string",
      createdBy: "string",
      creationDate: "string",
      contributors: "string",
      examContent: "string",
      examDuration: "string",
      examTotalMark: "number",
      numOfRegenerations: "number",
      approverMsg: "string",
    },
    primaryIndex: { partitionKey: "examID" },
    globalIndexes: {
      examStateIndex: { partitionKey: "examState" },
    },
  });


  const exams_dataset = new Table(stack, "ExamsDataset", {
    fields: {
      examID: "string",
      examContent: "string",
      examState: "string",
      approverMsg: "string",
    },
    primaryIndex: { partitionKey: "examID" },
    globalIndexes: {
      examStateIndex: { partitionKey: "examState" },
    },
  });

  //ADDED BY MA 
  const examRequestsTable = new Table(stack, "ExamRequests", {
  fields: {
    id: "string",         // ID للطلب
    status: "string",     // pending | processing | completed | failed
    request: "string",    // محتوى الطلب الأصلي
    response: "string",   // نتيجة المعالجة
  },
  primaryIndex: { partitionKey: "id" },
});


  return { users_table, exams_table, exams_dataset, examRequestsTable  };
}
