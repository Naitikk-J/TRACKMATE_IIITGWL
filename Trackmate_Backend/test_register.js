const checkRegistration = async () => {
  try {
    const res = await fetch('http://localhost:5010/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: "businesstest@example.com",
        password: "password123",
        full_name: "Test Business",
        role: "business",
        phone: "1234567890",
        business_name: "My Test Business",
        category: "retail",
        address: "123 Main St",
        ward_id: ""
      })
    });
    const text = await res.text();
    console.log("Response:", res.status, text);
  } catch(e) { console.error("Error:", e); }
};
checkRegistration();
