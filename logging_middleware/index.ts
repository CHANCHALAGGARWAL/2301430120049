import fetch from "node-fetch";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJhMjAyM2NzOTUyOUBpbXNlYy5hYy5pbiIsImV4cCI6MTc4MDg5NjE3OSwiaWF0IjoxNzgwODk1Mjc5LCJpc3MiOiJBZmZvcmQgTWVkaWNhbCBUZWNobm9sb2dpZXMgUHJpdmF0ZSBMaW1pdGVkIiwianRpIjoiMzBmOTRhYzctYmQ5Yy00MWE4LWEyY2MtZThlZTIwZDRjYWFhIiwibG9jYWxlIjoiZW4tSU4iLCJuYW1lIjoiY2hhbmNoYWwiLCJzdWIiOiIxZDlhYThlOS0wZDViLTQwNjgtYmM4Yy02M2MxYjk4NDA1ZGQifSwiZW1haWwiOiJhMjAyM2NzOTUyOUBpbXNlYy5hYy5pbiIsIm5hbWUiOiJjaGFuY2hhbCIsInJvbGxObyI6IjIzMDE0MzAxMjAwNDkiLCJhY2Nlc3NDb2RlIjoibnlYUU11IiwiY2xpZW50SUQiOiIxZDlhYThlOS0wZDViLTQwNjgtYmM4Yy02M2MxYjk4NDA1ZGQiLCJjbGllbnRTZWNyZXQiOiJhTXV6Rk1YQ01RdGtGSGN4In0.szq296pTEhyTRkOYE8VIWngopR9sSTPTViWT4RCris8";

export async function Log(
  stack: string,
  level: string,
  package_name: string,
  message: string
): Promise<void> {
  try {
    await fetch("http://4.224.186.213/evaluation-service/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        stack,
        level,
        package: package_name,
        message
      })
    });
  } catch (error) {
    console.error("Log failed:", error);
  }
}