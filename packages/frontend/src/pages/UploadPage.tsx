import React, { useState, ChangeEvent } from "react";
import invokeApig from "../lib/callAPI.ts";
import "../styles/UploadPage.css";
import { FiUploadCloud } from "react-icons/fi";

const UploadPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState("en"); // Default to English

  const handleSingleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMessage(null);

    const files = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
  };

  const handleFolderChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMessage(null);

    const files = e.target.files ? Array.from(e.target.files) : [];
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
  };

  const removeFile = (fileIndex: number) => {
    setSelectedFiles((prevFiles) =>
      prevFiles.filter((_, index) => index !== fileIndex)
    );
  };

  async function handleSubmit(e: ChangeEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (selectedFiles.length === 0) {
      setError("Please select files or a folder to upload.");
      return;
    }

    try {
      setIsLoading(true);

      // Upload each file
      for (const file of selectedFiles) {
        await uploadToS3(file, language);
        console.log(`File uploaded to S3 with language ${language}:`, file.name);
      }

      setSuccessMessage("All files have been uploaded successfully!");
      setSelectedFiles([]); // Clear files after upload
    } catch (uploadError) {
      setError("Something went wrong during upload. Please try again.");
      console.error(uploadError);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="upload-container"
    style={{marginTop:"2rem"}}
    >
      <h1 className="title">Upload Course Material</h1>
      <p className="subtitle">Select files or folder to upload</p>
      <form onSubmit={handleSubmit} className="upload-form">
        <div className="language-selector">
          <p>Select material language:</p>
          <label>
            <input
              type="radio"
              value="en"
              checked={language === "en"}
              onChange={(e) => setLanguage(e.target.value)}
            />
            English
          </label>
          <label>
            <input
              type="radio"
              value="ar"
              checked={language === "ar"}
              onChange={(e) => setLanguage(e.target.value)}
            />
            Arabic
          </label>
        </div>
        <div className="input-div">
          <label htmlFor="singleFileInput" className="file-label">
            <input
              type="file"
              id="singleFileInput"
              name="singleFile"
              accept=".pdf, .doc, .docx, .ppt, .pptx, .txt"
              className="file-input"
              multiple
              onChange={handleSingleFileChange}
            />
            Choose a file
          </label>
          <label htmlFor="folderInput" className="file-label">
            <input
              type="file"
              id="folderInput"
              name="folder"
              className="file-input"
              onChange={handleFolderChange}
              multiple
              //@ts-ignore
              webkitdirectory="true"
            />
            Choose a folder
          </label>
        </div>

        {selectedFiles.length > 0 && (
          <div className="file-list-container">
            <div className="file-list">
              {selectedFiles.map((file, index) => (
                <div key={index} className="file-item">
                  <span className="file-name">
                    {file.webkitRelativePath || file.name}
                  </span>
                  <button
                    type="button"
                    className="remove-file-button"
                    onClick={() => removeFile(index)}
                  >
                    ❌
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="submit"
          className={`upload-button ${isLoading ? "loading" : ""}`}
          disabled={selectedFiles.length === 0 || isLoading}
        >
          {isLoading && "Uploading"}
          {!isLoading && (
            <>
              Upload
              <FiUploadCloud
                style={{
                  fontSize: "1rem",
                  marginLeft: "0.5rem",
                  marginBottom: "-0.15rem",
                }}
              />
            </>
          )}
        </button>
      </form>
      {isLoading && <div className="loading-spinner"></div>}
      {error && <div className="error-message">{error}</div>}
      {successMessage && (
        <div className="success-message">{successMessage}</div>
      )}
    </div>
  );
};

async function uploadToS3(file: File, language: string) {
  const fileExtension = file.name.split(".").pop();
  const fileType = file.type;
  const filePath = file.webkitRelativePath.substring(0, file.webkitRelativePath.lastIndexOf("/"));

  console.log(filePath)

  console.log("File extension:", fileExtension);
  console.log("fle type: ", file.type);
  console.log("file name: ", file.name);

  const data = await invokeApig({
    path: "/uploadFiles",
    method: "GET",
    queryParams: {
      fileType: fileType,
      //@ts-ignore
      extension: fileExtension,
      name: file.name,
      path: filePath,
      language: language,
    },
  });

  const uploadUrl = data.uploadUrl;
  const key = data.key;

  console.log("uploadUrl: ", uploadUrl);
  console.log("key: ", key)

  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${file.name}`);
  }

  return key;
}

export default UploadPage;
