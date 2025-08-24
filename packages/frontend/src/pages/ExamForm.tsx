

import React, { useState, useEffect } from "react";
import invokeApig from "../lib/callAPI.ts";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { getCurrentUserEmail } from "../lib/getToken.ts";
import ExamCreationLoader from "../components/ExamCreationLoader.tsx";
import { useAlert } from "../components/AlertComponent.tsx";
import SpeechRecorder from "../components/SpeechRecorder.tsx";
import { getUserToken } from "../lib/getToken";



interface Part {
  part: string; // Part number or identifier
  title: string; // Title of the part
  total_marks: number; // Total marks for this part
  subsections: Subsection[]; // Array of subsections
}

interface Subsection {
  subsection: string; // Subsection identifier
  title: string; // Subsection title
  marks: number; // Marks for the subsection
  content: {
    passage?: string; // Optional passage
    questions?: Question[]; // Optional questions array
  };
}

interface Question {
  question: string;// Question text
  description?: string; // Optional description
  options?: string[]; // Optional multiple-choice options
}

interface ExamContent {
  parts: Part[]; // Add this to reflect the structure of the data
  [key: string]: any; // Allow flexibility for other properties
}


//storing user input
const ExamForm: React.FC = () => {
  //store the input
  const [_grade, setGrade] = useState("");
  const [_subject, setSubject] = useState("");
  const [_duration, setDuration] = useState("");
  const [_totalMark, setMark] = useState("");
  const [_semester, setSemester] = useState("");
  const [createdBy, setCreator] = useState("");
  const [creationDate, setDate] = useState("");
  const [contributors, setContributors] = useState("");
  const [examState, setExamState] = useState("");
  const [_responseResult, _setResponseResult] = useState<string>(""); // State to store the API response
  //const [examContent, setExamContent] = useState<any>(null); // Store exam content as JSON
  const [examContent, setExamContent] = useState<ExamContent | null>(null);
  const [_editMode, _setEditMode] = useState(false); // Toggle edit mode
  const [_editedContent, _setEditedContent] = useState<Record<string, any>>({});
  
 


  // State for feedback and UI
  const [loadingStates, setLoadingStates] = useState<{ [key: string]: boolean }>({});

  const [_loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState(true);
  const [_isLoading, _setIsLoading] = useState(false);
  const [loadingApproval, setLoadingApproval] = useState(false);
  const [feedback, setFeedback] = useState<{ [section: string]: string }>({});
  const [isEditing, setIsEditing] = useState(false);

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showAlert, closeAlert} = useAlert();
  

  
  let pollAttempts = 0;
  const MAX_ATTEMPTS = 30; // 3 دقائق
  
  // Fetch Initial Data
  const fetchInitialData = async () => {
    try {
      //@ts-ignore
      const response = await invokeApig({
        path: `/examForm/${id}`, // Adjust path as needed
        method: "GET",
      });
      
      if (!response || !response.examContent) {
        pollAttempts++;
        
        if (pollAttempts === 1) {
          showAlert({
            type: "progress",
            message: "جاري إنشاء الامتحان، يرجى الانتظار...",
          });
        }
        if (pollAttempts < MAX_ATTEMPTS) {
          setTimeout(fetchInitialData, 10000);
        } else {
          showAlert({
            type: "failure",
            message: "انتهى الوقت ولم يتم إنشاء الامتحان. حاول لاحقاً.",
          });
          setLoadingPage(false);
        }
        return;
      }

      console.log("Initial Data Loaded:", response);

      const content = response.examContent;

      if (typeof content === "string") {
        try {
          const parsedContent = JSON.parse(content);
          setExamContent(parsedContent);
          showAlert({
            type: "success",
            message: "تم تحميل الامتحان بنجاح"
          });
          setTimeout(() => {
            closeAlert();
          }, 2000);
        } catch (parseError) {
          console.error("Failed to parse exam content as JSON:", content);
          showAlert({
            type: "failure",
            message: "Invalid exam format"
          });
          setLoadingPage(false);
          return;
        }
      } else if (typeof content === "object") {
        setExamContent(content);
        showAlert({
          type: "success",
          message: "تم تحميل الامتحان بنجاح"
        });
        setTimeout(() => {
          closeAlert();
        }, 2000);
      } else {
        console.error("Unexpected examContent format:", typeof content);
        showAlert({
          type: "failure",
          message: "Invalid exam format",
        });
        setLoadingPage(false);
        return;
      }

      // Set metadata fields
      setGrade(response.examClass || "");
      setSubject(response.examSubject || "");
      setSemester(response.examSemester || "");
      setCreator(response.createdBy || "");
      setDate(response.creationDate || "");
      setContributors(String(response.contributors || ""));
      setDuration(response.examDuration || "");
      setMark(response.examMark || "");
      setExamState(response.examState || "");

      // Redirect if exam is not in "building" state
      if (response.examState !== "building") {
        navigate(`/dashboard/viewExam/${id}`);
      }
      setLoadingPage(false);
    } catch (err: any) {
      console.error("Error fetching initial data:", err);
      showAlert({
        type: "failure",
        message: "Failed to load",
      });
    } finally {
      setLoadingPage(false); // Mark loading as complete
    }
  };


  const fetchExamContent = async () => {
    try {
      //@ts-ignore
      const response = await invokeApig({
        path: `/examForm/${id}`,
        method: "GET",
      });

      console.log("Raw Exam Content from Backend:", response.examContent);

     /* if (!response.examContent) {
        showAlert({
          type: "failure",
          message: "Failed to load",
        });*/
        return;
      //}

      // if (response.examSubject !== "ARAB101") {

        let parsedContent;
        try {
          // Extract the JSON portion from the descriptive text
          const jsonStartIndex = response.examContent.indexOf("{");
          const jsonEndIndex = response.examContent.lastIndexOf("}");
          if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            const jsonString = response.examContent.substring(jsonStartIndex, jsonEndIndex + 1).trim();
            console.log("Extracted JSON String:", jsonString);
            parsedContent = JSON.parse(jsonString); // Parse the JSON object
          } else {
            throw new Error("No valid JSON found in examContent string.");
          }
        } catch (error) {
          console.error("Failed to parse exam content as JSON:", response.examContent);
          showAlert({
            type: "failure",
            message: "Invalid exam format",
          });
          return;
        }
      
        setExamContent(parsedContent);
        console.log("Parsed Exam Content Successfully Set in State:", parsedContent);
      } catch (error) {
        console.error("Error fetching exam content:", error);
        return;
      }
  };


  useEffect(() => {
    const loadExamContent = async () => {
      try {
        await fetchExamContent(); // Fetch and parse content
      } catch (err) {
        console.error("Error loading exam content:", err);
        showAlert({
          type: "failure",
          message: "Failed to load",
        });
      }
    };
    loadExamContent();
  }, [id]);
  
 
  useEffect(() => {
    let isCancelled = false;
  
    const timer = setTimeout(async () => {
      try {
        if (!isCancelled) {
          await fetchInitialData();
        }
      } catch (error) {
        console.error("Error fetching initial data:", error);
        if (!isCancelled) {
          showAlert({
            type: "failure",
            message: "Failed to load",
          });
        }
      }
    }, 2000); // 2-second delay
  
    
    return () => {
      clearTimeout(timer);
      isCancelled = true;
    };
  }, [id]);



  const sendForApproval = async () => {
    setLoadingApproval(true);
    const payload = {
      examID: id,
    };

    try {
      const response = await invokeApig({
        path: "/sendForApproval",
        method: "POST",
        body: payload,
        isFunction: false,
      });

      console.log(response);
      navigate("/dashboard/viewExam/" + id);
    } catch (error) {
      console.error("Error sending exam:", error);
      showAlert({
        type: "failure",
        message: "Failed to send",
      });
    } finally {
      setLoadingApproval(false);
    }
  };


  const handleFeedbackSubmission = async (sectionIndex: number) => {
    console.log(await getCurrentUserEmail())
    setLoadingStates((prev) => ({
      ...prev,
      [`section-${sectionIndex}`]: true, // Set loading state for the clicked section
    }));
  
    // Prepare the feedback payload, including only non-empty feedback
    const feedbackPayload = Object.entries(feedback)
      .filter(([_, feedbackText]) => feedbackText.trim()) // Only include sections with feedback
      .map(([section, feedbackText]) => ({
        section,
        feedback: feedbackText.trim(),
      }));
  
    if (feedbackPayload.length === 0) {
      showAlert({
        type: "failure",
        message: "Add feedback before submitting",
      });
      setLoadingStates((prev) => ({
        ...prev,
        [`section-${sectionIndex}`]: false, // Reset loading state for the specific section
      }));
      return;
    }
    
    let currentUser = await getCurrentUserEmail();
    let newContributors = contributors;
    if (currentUser) {
      if (!contributors.includes(currentUser)) {
        newContributors += " " + currentUser;
        console.log("Contributors: " + newContributors)
      }
    }
  
    const cleanedFeedback = feedbackPayload.map(item => ({
      section: item.section,
      feedback: typeof item.feedback === 'string' ? item.feedback : JSON.stringify(item.feedback)
    }));
    /*
    const requestBody = {
      examID: id!, // Exam ID
      feedback: cleanedFeedback, // مصفوفة feedback مضمونة كلها string
      contributors: newContributers, // Current user as contributor
    };
    */
    if (!examContent) {
      console.error("examContent is null!");
      return;
    }
    
    const sectionIndexes = new Set<number>();
    cleanedFeedback.forEach(f => {
      const match = f.section.match(/section-(\d+)/);
      if (match) {
        sectionIndexes.add(parseInt(match[1]));
      }
    });
    
    const reducedExamContent = {
      ...examContent,
      sections: examContent.sections.filter((_section: any, i: number) =>
        sectionIndexes.has(i)
      ),
    };

  const requestBody = {
    examID: id!,
    examContent: reducedExamContent, // محتوى الامتحان الحالي من الـ state
    description: cleanedFeedback.map(f => `${f.section}: ${f.feedback}`).join(" | "), 
    contributors: newContributors,
    sectionIndexes:sectionIndexes,
    };
    
    // ✅ طباعة واضحة لمراجعة الشكل النهائي قبل الإرسال
    console.log("📦 Final requestBody to be sent:", JSON.stringify(requestBody, null, 2));

  
    try {
      setLoading(true);

      const token = await getUserToken(currentUser);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/regenerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      
      });
      
  
      console.log("API Response:", response);
      const data = await response.json();
  
      // Check if the backend returns the updated content
      if (data.updatedExamContent) {
        setExamContent(data.updatedExamContent); // Update the entire exam content
      }
  
      if (data.totalMarks) {
        setMark(data.totalMarks); // Update the total marks
      }
  
      // // Provide feedback to the user
      if (data.updatedExamContent || data.totalMarks) {
        // Refresh the page after the success message
        window.location.reload();
      } else {
        showAlert({
          type: "success",
          message: "Changes applied",
        });
      }
  
      // Clear the feedback fields after submission
      setFeedback({});

      setLoadingStates((prev) => ({
        ...prev,
        [`section-${sectionIndex}`]: false, // Reset loading state
      }));
      
    } catch (error) {
      console.error("Error submitting feedback:", error);
     showAlert({
        type: "failure",
        message: "Failed to send",
      });
    } finally {
      setLoading(false); // Stop loading animation
    }
  };



  return (
    <div
      style={{
        flex: 1,
        backgroundColor: "#ffffff",
        padding: "2rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowY: "auto",
        height: "auto",
      }}
    >
      <div>
        {loadingPage && (
          <div
            style={{
              width: "100%",
              maxWidth: "700px",
              padding: "2rem",
              borderRadius: "12px",
            }}
          >
            <h3
              style={{
                textAlign: "center",
                color: "rgb(12, 84, 125)",
                fontWeight: "700",
                fontSize: "24px",
                fontFamily: "Arial, sans-serif",
              }}
            >
              Loading
            </h3>
            <ExamCreationLoader /> <br />
          </div>
        )}
      </div>

      {!loadingPage && (
        <div
          style={{
            flex: 1,
            backgroundColor: "#ffffff",
            padding: "2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            overflowY: "auto",
            height: "auto",
          }}
        >
          <h2
            style={{
              fontFamily: "Arial, sans-serif",
              color: "rgb(12, 84, 125)",
              marginBottom: "1rem",
              fontSize: "24px",
              marginTop: "0",
              fontWeight: "700",
            }}
          >
            Modify Exam
          </h2>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between", // Align buttons to opposite sides
              gap: "1rem", // Adds space between buttons
              width: "100%",
              maxWidth: "900px",
              padding: "1rem 0",
            }}
          >
            {examState === "building" && (
              <button
                onClick={sendForApproval}
                style={{
                  padding: "0.5rem 1rem", // Smaller padding for a smaller button
                  backgroundColor: "#007BFF", // Blue color for 'Send For Approval'
                  color: "#fff",
                  border: "none",
                  borderRadius: "20px",
                  fontSize: "16px", // Smaller font size
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.3s ease",
                  boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
                  width: "auto", // Auto width to fit text
                }}
              >
                {loadingApproval ? (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                    }}
                  >
                    <span
                      style={{
                        width: "1rem",
                        height: "1rem",
                        border: "2px solid #000",
                        borderRadius: "50%",
                        borderTop: "2px solid transparent",
                        animation: "spin 1s linear infinite",
                        color: "#fff",
                      }}
                    />
                  </span>
                ) : (
                  "Submit for approval"
                )}
              </button>
            )}

            <button
              onClick={() => setIsEditing(!isEditing)}
              style={{
                backgroundColor: isEditing ? "#FF5722" : "#007BFF",
                color: "#fff",
                border: "none",
                padding: "10px 20px",
                borderRadius: "20px",
                cursor: "pointer",
                fontSize: "16px", // Smaller font size
                fontWeight: "600",
              }}
            >
              {isEditing ? "Cancel edit" : "Edit"}
            </button>
          </div>

          <div
            style={{
              width: "900px",
              fontSize: "14px",
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "1rem",
              padding: "1rem",
              backgroundColor: "#fff",
              borderRadius: "20px",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
              color: "#333",
            }}
          >
            <div style={{ flex: 1, textAlign: "left", paddingRight: "1rem" }}>
              <strong>Creation Date:</strong> {creationDate}
            </div>
            <div style={{ flex: 1, textAlign: "center", paddingRight: "1rem" }}>
              <strong>Created By:</strong> {createdBy}
            </div>
            <div
              style={{
                flex: 1,
                textAlign: "right",
                overflowX: "auto", // Enables horizontal scrolling
                whiteSpace: "nowrap", // Prevents text wrapping
                paddingRight: "1rem",
              }}
            >
              <strong>Contributors: </strong>
              <div
                style={{
                  display: "inline-block",
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis", // Adds ellipsis when content overflows
                }}
              >
                {contributors}
              </div>
            </div>
          </div>

          <div style={{ borderRadius: "20px" }}>
            {examContent?.parts?.map((part: any, partIndex: number) => (
              <div key={`part-${partIndex}`} style={{ marginTop: "1rem" }}>
                <h3 style={{ fontWeight: "bold" }}>
                  Part {part.part}: {part.title}
                </h3>
                <p>
                  <strong>Total Marks:</strong> {part.total_marks}
                </p>
                {/* Render Subsections unused */}
                {part.subsections?.map((subsection: any, subIndex: number) => (
                  <div
                    key={`subsection-${partIndex}-${subIndex}`}
                    style={{ marginTop: "1rem" }}
                  >
                    <h4>
                      Subsection {subsection.subsection}: {subsection.title}
                    </h4>
                    <p>Marks: {subsection.marks}</p>
                    {/* Render Questions */}
                    {subsection.content?.questions?.length ? (
                      subsection.content.questions.map(
                        (question: any, qIndex: number) => (
                          <div
                            key={`question-${partIndex}-${subIndex}-${qIndex}`}
                            style={{ marginTop: "0.5rem" }}
                          >
                            <p>
                              <strong>{qIndex + 1}.</strong> {question.question}
                              {question.description}
                            </p>
                            {question.options?.map(
                              (option: string, oIndex: number) => (
                                <p
                                  key={`option-${partIndex}-${subIndex}-${qIndex}-${oIndex}`}
                                >
                                  {String.fromCharCode(65 + oIndex)}. {option}
                                </p>
                              )
                            )}
                          </div>
                        )
                      )
                    ) : (
                      <p>No questions available.</p>
                    )}

                    {/* Feedback Input Box for Subsection*/}
                    {isEditing && (
                      <textarea
                        placeholder={`Provide feedback for ${subsection.title}`}
                        value={feedback[`${part.part}-${subIndex}`] || ""}
                        onChange={(e) =>
                          setFeedback((prev) => ({
                            ...prev,
                            [`${part.part}-${subIndex}`]: e.target.value,
                          }))
                        }
                        style={{
                          width: "100%",
                          minHeight: "60px",
                          marginTop: "10px",
                          marginBottom: "10px",
                          padding: "10px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                          resize: "none",
                        }}
                      />
                    )}
                  </div>
                ))}

                {/* Feedback Input Box for Entire Part unused */}
                {isEditing && (
                  <textarea
                    placeholder={`Provide feedback for Part ${part.part}`}
                    value={feedback[`part-${partIndex}`] || ""}
                    onChange={(e) =>
                      setFeedback((prev) => ({
                        ...prev,
                        [`part-${partIndex}`]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      minHeight: "60px",
                      marginTop: "10px",
                      marginBottom: "10px",
                      padding: "10px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      resize: "none",
                    }}
                  />
                )}
              </div>
            ))}
            {/* Render Exam Sections */}
            <div
              style={{
                width: "900px",
                padding: "20px",
                backgroundColor: "#fff",
                borderRadius: "20px",
                boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
              }}
            >
              {/* Title and Overview */}
              <p>
                <strong>{examContent?.title}</strong>
              </p>
              <p>
                <strong>Total Marks:</strong> {examContent?.total_marks}
              </p>
              <p>
                <strong>Time:</strong> {examContent?.time}
              </p>

              {/* Render Sections */}
              {examContent?.sections?.map(
                (section: any, sectionIndex: number) => (
                  <div
                    key={`section-${sectionIndex}`}
                    style={{
                      marginTop: "1rem",
                      padding: "1rem",
                      backgroundColor: "#f9f9f9",
                      borderRadius: "8px",
                      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    {/* Section Title */}
                    <h3 style={{ fontWeight: "bold", marginBottom: "1rem" }}>
                      Part {section.part}: {section.title} (Total Marks:{" "}
                      {section.total_marks})
                    </h3>

                    {/* Feedback Text Area for Section */}
                    {isEditing && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <textarea
                          placeholder={`Provide feedback for Part ${section.part}: ${section.title}`}
                          value={feedback[`section-${sectionIndex}`] || ""}
                          onChange={(e) =>
                            setFeedback((prev) => ({
                              ...prev,
                              [`section-${sectionIndex}`]: e.target.value,
                            }))
                          }
                          style={{
                            width: "100%",
                            minHeight: "60px",
                            marginTop: "10px",
                            padding: "10px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                            backgroundColor: "#ffffff",
                            resize: "none",
                          }}
                        />

                        <SpeechRecorder
                          onTranscriptChange={(transcript) =>
                            setFeedback((prev) => ({
                              ...prev,
                              [`section-${sectionIndex}`]: transcript, // Update the specific section
                            }))
                          }
                          size={20}
                          color="#4F46E5"
                        />
                      </div>
                    )}

                    {/* Feedback Submission Button */}
                    {isEditing && (
                      <button
                        onClick={() => handleFeedbackSubmission(sectionIndex)} // Pass sectionIndex
                        style={{
                          marginTop: "10px",
                          backgroundColor: loadingStates[
                            `section-${sectionIndex}`
                          ]
                            ? "#6c757d"
                            : "#28a745",
                          color: "#fff",
                          border: "none",
                          padding: "5px 10px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          cursor: loadingStates[`section-${sectionIndex}`]
                            ? "not-allowed"
                            : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.4rem",
                          width: "120px",
                          height: "30px",
                        }}
                        disabled={loadingStates[`section-${sectionIndex}`]} // Disable button when loading
                      >
                        {loadingStates[`section-${sectionIndex}`] ? (
                          <>
                            <span
                              style={{
                                width: "0.8rem",
                                height: "0.8rem",
                                border: "2px solid #fff",
                                borderRadius: "50%",
                                borderTop: "2px solid transparent",
                                animation: "spin 1s linear infinite",
                              }}
                            ></span>
                            <span style={{ fontSize: "10px" }}></span>
                          </>
                        ) : (
                          <span style={{ fontSize: "12px" }}>
                            Apply changes
                          </span>
                        )}
                      </button>
                    )}

                    {/* Render Subsections */}

                    {/* Subsections (Optional) */}
                    {section.subsections?.map(
                      (subsection: any, subIndex: number) => (
                        <div
                          key={`subsection-${sectionIndex}-${subIndex}`}
                          style={{
                            marginTop: "1rem",
                            padding: "1rem",
                            backgroundColor: "#ffffff",
                            borderRadius: "8px",
                            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                          }}
                        >
                          <h4
                            style={{
                              fontWeight: "bold",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {subsection.subsection}: {subsection.title} (
                            {subsection.marks} Marks)
                          </h4>

                          {/* Content */}
                          {/* Content: Passage or Dialogue "listening"*/}
                          {subsection.content?.passage && (
                            <p
                              style={{
                                fontStyle: "italic",
                                marginBottom: "1rem",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {subsection.content.passage}
                            </p>
                          )}
                          {subsection.content?.dialogue && (
                            <pre
                              style={{
                                fontStyle: "italic",
                                marginBottom: "1rem",
                                whiteSpace: "pre-wrap",
                                backgroundColor: "#f8f8f8",
                                padding: "10px",
                                borderRadius: "4px",
                              }}
                            >
                              {subsection.content.dialogue}
                            </pre>
                          )}

                          {/* Questions */}
                          {subsection.content?.questions &&
                            Array.isArray(subsection.content.questions) && (
                              <div style={{ marginBottom: "20px" }}>
                                <h4>Questions:</h4>
                                <ul>
                                  {subsection.content.questions.map(
                                    (question: any, questionIndex: number) => (
                                      <li
                                        key={`question-${sectionIndex}-${subIndex}-${questionIndex}`}
                                      >
                                        <p>
                                          <strong>Q{questionIndex + 1}:</strong>{" "}
                                          {question.question ||
                                            question.sentence ||
                                            question.description}
                                        </p>
                                        {/* Options for Multiple-Choice Questions */}
                                        {question.options && (
                                          <ul
                                            style={{
                                              listStyleType: "disc",
                                              marginLeft: "20px",
                                            }}
                                          >
                                            {question.options.map(
                                              (
                                                option: string,
                                                optionIndex: number
                                              ) => (
                                                <li
                                                  key={`option-${questionIndex}-${optionIndex}`}
                                                >
                                                  {String.fromCharCode(
                                                    65 + optionIndex
                                                  )}
                                                  . {option}
                                                </li>
                                              )
                                            )}
                                          </ul>
                                        )}
                                        {/* Answer */}
                                        {question.answer && (
                                          <p>
                                            <strong>Answer:</strong>{" "}
                                            {question.answer}
                                          </p>
                                        )}

                                        {question.paragraph_matching && (
                                          <div>
                                            {question.paragraph_matching.map(
                                              (q: any, i: any) => (
                                                <p
                                                  key={`definition-${i}`}
                                                  style={{ marginTop: "10px" }}
                                                >
                                                  {q.question}:{" "}
                                                  <span
                                                    style={{
                                                      fontWeight: "bold",
                                                    }}
                                                  >
                                                    ________
                                                  </span>
                                                  <br />
                                                  <strong>Answer:</strong>{" "}
                                                  {q.answer}
                                                </p>
                                              )
                                            )}
                                          </div>
                                        )}

                                        {question.short_answer && (
                                          <div>
                                            {question.short_answer.map(
                                              (q: any, i: any) => (
                                                <div
                                                  key={i}
                                                  style={{
                                                    marginBottom: "10px",
                                                  }}
                                                >
                                                  <strong>{i + 1}.</strong>
                                                  {q.question} <br />
                                                  <strong>Answer: </strong>
                                                  {q.answer}
                                                </div>
                                              )
                                            )}
                                          </div>
                                        )}

                                        {question.true_false && (
                                          <div
                                            style={{
                                              marginTop: "10px",
                                              marginBottom: "10px",
                                            }}
                                          >
                                            {question.true_false.map(
                                              (q: any, i: any) => (
                                                <div
                                                  key={i}
                                                  style={{
                                                    marginBottom: "10px",
                                                  }}
                                                >
                                                  {q.question}________ <br />(
                                                  <span
                                                    style={{
                                                      fontWeight: "bold",
                                                    }}
                                                  >
                                                    answer: {q.answer}
                                                  </span>
                                                  )
                                                </div>
                                              )
                                            )}
                                          </div>
                                        )}

                                        {question.syntax_analysis && (
                                          <div>
                                            {question.syntax_analysis.map(
                                              (q: any, i: any) => (
                                                <div
                                                  key={i}
                                                  style={{
                                                    marginBottom: "10px",
                                                  }}
                                                >
                                                  <strong>
                                                    {i + 1}. {q.question}{" "}
                                                  </strong>
                                                  <br />
                                                  <strong>Answer: </strong>
                                                  {q.answer}
                                                </div>
                                              )
                                            )}
                                          </div>
                                        )}

                                        {question.vocabulary_matching && (
                                          <div>
                                            <p
                                              style={{
                                                fontWeight: "bold",
                                                marginBottom: "10px",
                                              }}
                                            >
                                              Words:
                                            </p>
                                            <ul style={{ marginLeft: "20px" }}>
                                              {question.vocabulary_matching.map(
                                                (
                                                  question: any,
                                                  questionIndex: number
                                                ) => (
                                                  <li
                                                    key={`word-${questionIndex}`}
                                                    style={{
                                                      listStyleType: "circle",
                                                    }}
                                                  >
                                                    {question.question}
                                                  </li>
                                                )
                                              )}
                                            </ul>

                                            {question.vocabulary_matching.map(
                                              (q: any, i: any) => (
                                                <p
                                                  key={`definition-${i}`}
                                                  style={{ marginTop: "10px" }}
                                                >
                                                  {q.answer}:{" "}
                                                  <span
                                                    style={{
                                                      fontWeight: "bold",
                                                    }}
                                                  >
                                                    ________
                                                  </span>
                                                  <br />
                                                  <strong>Answer:</strong>{" "}
                                                  {q.question}
                                                </p>
                                              )
                                            )}
                                          </div>
                                        )}
                                      </li>
                                    )
                                  )}
                                </ul>
                              </div>
                            )}

                          {/* True/False Questions */}
                          {subsection.content?.questions?.["true-false"] && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4>True/False Questions:</h4>
                              {subsection.content.questions["true-false"].map(
                                (question: any, questionIndex: number) => (
                                  <p
                                    key={`true-false-${questionIndex}`}
                                    style={{
                                      marginTop: "10px",
                                      marginBottom: "10px",
                                    }}
                                  >
                                    {question.statement}________ (
                                    <span style={{ fontWeight: "bold" }}>
                                      answer: {question.answer}
                                    </span>
                                    )
                                  </p>
                                )
                              )}
                            </div>
                          )}

                          {/* Vocabulary Matching */}
                          {subsection.content?.questions?.[
                            "vocabulary-matching"
                          ] && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4>Vocabulary Matching:</h4>
                              <p
                                style={{
                                  fontWeight: "bold",
                                  marginBottom: "10px",
                                }}
                              >
                                Words:
                              </p>
                              <ul style={{ marginLeft: "20px" }}>
                                {subsection.content.questions[
                                  "vocabulary-matching"
                                ].map(
                                  (question: any, questionIndex: number) => (
                                    <li
                                      key={`word-${questionIndex}`}
                                      style={{ listStyleType: "circle" }}
                                    >
                                      {question.word}
                                    </li>
                                  )
                                )}
                              </ul>
                              {subsection.content.questions[
                                "vocabulary-matching"
                              ].map((question: any, questionIndex: number) => (
                                <p
                                  key={`definition-${questionIndex}`}
                                  style={{ marginTop: "10px" }}
                                >
                                  {question.definition}:{" "}
                                  <span style={{ fontWeight: "bold" }}>
                                    ________
                                  </span>
                                  <br />
                                  <strong>Answer:</strong> {question.word}
                                </p>
                              ))}
                            </div>
                          )}

                          {/* Exercises (Specific to "Use of English") */}
                          {subsection.content?.exercises && (
                            <div style={{ marginBottom: "20px" }}>
                              <h4>Exercises:</h4>
                              <ul>
                                {subsection.content.exercises.map(
                                  (exercise: any, exerciseIndex: number) => (
                                    <li
                                      key={`exercise-${sectionIndex}-${subIndex}-${exerciseIndex}`}
                                      style={{ marginBottom: "10px" }}
                                    >
                                      <p>
                                        <strong>Type:</strong> {exercise.type}
                                      </p>
                                      <p>
                                        <strong>{exercise.question}</strong>
                                      </p>
                                      <p>
                                        <strong>Answer:</strong>{" "}
                                        {exercise.answer}
                                      </p>
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}

                          {/* Feedback Text Area for Subsection */}
                          {isEditing && (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <textarea
                                placeholder={`Provide feedback for Subsection ${subsection.subsection}: ${subsection.title}`}
                                value={
                                  feedback[
                                    `section-${sectionIndex}-subsection-${subIndex}`
                                  ] || ""
                                }
                                onChange={(e) =>
                                  setFeedback((prev) => ({
                                    ...prev,
                                    [`section-${sectionIndex}-subsection-${subIndex}`]:
                                      e.target.value,
                                  }))
                                }
                                style={{
                                  width: "100%",
                                  minHeight: "60px",
                                  marginTop: "10px",
                                  padding: "10px",
                                  borderRadius: "4px",
                                  border: "1px solid #ccc",
                                  backgroundColor: "#ffffff",
                                  resize: "none",
                                }}
                              />

                              <SpeechRecorder
                                onTranscriptChange={(transcript) =>
                                  setFeedback((prev) => ({
                                    ...prev,
                                    [`section-${sectionIndex}`]: transcript, // Update the specific section
                                  }))
                                }
                                size={20}
                                color="#4F46E5"
                              />
                            </div>
                          )}

                          {/* Feedback Submission Button  */}
                          {isEditing && (
                            <button
                              onClick={() =>
                                handleFeedbackSubmission(sectionIndex)
                              } // Pass sectionIndex
                              style={{
                                marginTop: "10px",
                                backgroundColor: loadingStates[
                                  `section-${sectionIndex}`
                                ]
                                  ? "#6c757d"
                                  : "#28a745",
                                color: "#fff",
                                border: "none",
                                padding: "5px 10px",
                                borderRadius: "20px",
                                fontSize: "14px",
                                cursor: loadingStates[`section-${sectionIndex}`]
                                  ? "not-allowed"
                                  : "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.4rem",
                                width: "120px",
                                height: "30px",
                              }}
                              disabled={
                                loadingStates[`section-${sectionIndex}`]
                              } // Disable button when loading
                            >
                              {loadingStates[`section-${sectionIndex}`] ? (
                                <>
                                  <span
                                    style={{
                                      width: "0.8rem",
                                      height: "0.8rem",
                                      border: "2px solid #fff",
                                      borderRadius: "50%",
                                      borderTop: "2px solid transparent",
                                      animation: "spin 1s linear infinite",
                                    }}
                                  ></span>
                                  <span style={{ fontSize: "10px" }}>
                                    Submitting...
                                  </span>
                                </>
                              ) : (
                                <span style={{ fontSize: "12px" }}>
                                  Apply changes
                                </span>
                              )}
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )
              )}
              {/* Writing Section */}
              {examContent?.sections?.some(
                (section: any) => section.part === "3"
              ) ? (
                examContent.sections.map(
                  (section: any, sectionIndex: number) => {
                    if (section.part === "3") {
                      return (
                        <div
                          key={`writing-${sectionIndex}`}
                          style={{ marginTop: "20px" }}
                        >
                          {section.content?.questions?.map(
                            (question: any, questionIndex: number) => (
                              <div
                                key={`writing-question-${questionIndex}`}
                                style={{ marginLeft: "20px" }}
                              >
                                <p>
                                  <strong>{question.type}:</strong>{" "}
                                  {question.prompt}
                                </p>
                                {question.word_limit && (
                                  <p>
                                    <strong>Word Limit:</strong>{" "}
                                    {question.word_limit}
                                  </p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      );
                    }
                    return null;
                  }
                )
              ) : (
                <p></p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Render Exam Parts */}

      <style>
        {`
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `}
      </style>
    </div>
  );
  
};

export default ExamForm;
