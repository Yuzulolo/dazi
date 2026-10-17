import {
  DAY_RHYTHMS,
  GENDER_HELP,
  GENDERS,
  LANGUAGES,
  PREF_GENDERS,
  TRAVEL_INTERESTS,
  TRAVEL_PACES,
} from "@/lib/profile/options";
import type { ProfileFormValues } from "@/lib/profile/types";

// Plain form fields shared by /onboarding and /me/edit. Unstyled until docs/DESIGN.md exists.

export function BirthYearField({
  birthYear,
  defaultValue,
}: {
  birthYear: number | null;
  defaultValue?: string;
}) {
  if (birthYear !== null) {
    return (
      <p>
        Birth year: {birthYear} <small>(can&apos;t be changed; others only see an age range)</small>
      </p>
    );
  }
  return (
    <p>
      <label htmlFor="birthYear">Birth year</label>
      <br />
      <input
        id="birthYear"
        name="birthYear"
        type="text"
        inputMode="numeric"
        pattern="\d{4}"
        required
        placeholder="e.g. 1995"
        defaultValue={defaultValue}
      />
      <br />
      <small>Dazi is for adults only. Others only see an age range. It can&apos;t be changed later.</small>
    </p>
  );
}

export function BasicsFields({ values }: { values: ProfileFormValues }) {
  return (
    <>
      <p>
        <label htmlFor="displayName">Display name</label>
        <br />
        <input id="displayName" name="displayName" required maxLength={50} defaultValue={values.displayName} />
      </p>

      <p>
        <label htmlFor="gender">Gender (optional)</label>
        <br />
        <select id="gender" name="gender" defaultValue={values.gender}>
          <option value="">Prefer not to say</option>
          {GENDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <br />
        <small>{GENDER_HELP}</small>
      </p>

      <fieldset>
        <legend>Languages you speak (at least one)</legend>
        {LANGUAGES.map((o) => (
          <label key={o.value}>
            <input
              type="checkbox"
              name="languages"
              value={o.value}
              defaultChecked={values.languages.includes(o.value)}
            />{" "}
            {o.label}{" "}
          </label>
        ))}
      </fieldset>

      <p>
        <label htmlFor="homeCity">Home city</label>
        <br />
        <input id="homeCity" name="homeCity" required maxLength={80} defaultValue={values.homeCity} />
      </p>

      <p>
        <label htmlFor="bio">About you (optional, up to 500 characters)</label>
        <br />
        <textarea id="bio" name="bio" rows={4} cols={50} maxLength={500} defaultValue={values.bio} />
        <br />
        <small>No contact details (email or phone) — those are shared later, only if you both agree.</small>
      </p>

      <p>
        <label htmlFor="visitedCities">Cities you&apos;ve visited (optional, comma-separated)</label>
        <br />
        <input id="visitedCities" name="visitedCities" size={50} defaultValue={values.visitedCities} placeholder="Lisbon, Tokyo, Mexico City" />
      </p>

      <p>
        <label htmlFor="hobbies">Hobbies (optional, comma-separated)</label>
        <br />
        <input id="hobbies" name="hobbies" size={50} defaultValue={values.hobbies} placeholder="film photography, bouldering, vinyl" />
      </p>

      <fieldset>
        <legend>Who would you like to meet? (private, only used for matching)</legend>
        <label htmlFor="prefAgeMin">Age from</label>{" "}
        <input id="prefAgeMin" name="prefAgeMin" type="number" min={18} max={99} required defaultValue={values.prefAgeMin} />{" "}
        <label htmlFor="prefAgeMax">to</label>{" "}
        <input id="prefAgeMax" name="prefAgeMax" type="number" min={18} max={99} required defaultValue={values.prefAgeMax} />
        <br />
        <label htmlFor="prefGender">Gender</label>{" "}
        <select id="prefGender" name="prefGender" defaultValue={values.prefGender}>
          <option value="">Anyone</option>
          {PREF_GENDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </fieldset>
    </>
  );
}

export function StyleFields({ values }: { values: ProfileFormValues }) {
  return (
    <>
      <fieldset>
        <legend>Travel pace</legend>
        {TRAVEL_PACES.map((o) => (
          <label key={o.value}>
            <input type="radio" name="travelPace" value={o.value} required defaultChecked={values.travelPace === o.value} />{" "}
            {o.label}
            <br />
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Day rhythm</legend>
        {DAY_RHYTHMS.map((o) => (
          <label key={o.value}>
            <input type="radio" name="dayRhythm" value={o.value} required defaultChecked={values.dayRhythm === o.value} />{" "}
            {o.label}{" "}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Travel interests (at least one)</legend>
        {TRAVEL_INTERESTS.map((o) => (
          <label key={o.value}>
            <input
              type="checkbox"
              name="travelInterests"
              value={o.value}
              defaultChecked={values.travelInterests.includes(o.value)}
            />{" "}
            {o.label}
            <br />
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" aria-live="polite">
      {error}
    </p>
  );
}
