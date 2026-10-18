// Profile values as the forms see them: text inputs as strings,
// checkbox groups as string arrays, comma lists as one string.
export type ProfileFormValues = {
  displayName: string;
  gender: string;
  languages: string[];
  homeCity: string;
  bio: string;
  visitedCities: string;
  hobbies: string;
  prefAgeMin: string;
  prefAgeMax: string;
  prefGender: string;
  travelPace: string;
  dayRhythm: string;
  travelInterests: string[];
};

// Shared by every profile form's useActionState.
export type ProfileFormState = {
  error?: string;
  values?: ProfileFormValues; // echoed back on error so nothing typed is lost
  birthYear?: string;
};
