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

// Plain form fields shared by /onboarding and /me/edit, styled by the calm
// variant (app/_styles/dazi-forms.css). Checkbox and radio groups are real
// inputs shown as tags.

export function BirthYearField({
  birthYear,
  defaultValue,
}: {
  birthYear: number | null;
  defaultValue?: string;
}) {
  if (birthYear !== null) {
    return (
      <div className="field">
        <span className="field-label">Birth year</span>
        <p className="read-only-value">{birthYear}</p>
        <small className="field-help">Can&apos;t be changed. Others only see an age range.</small>
      </div>
    );
  }
  return (
    <p className="field">
      <label htmlFor="birthYear">Birth year</label>
      <input
        id="birthYear"
        name="birthYear"
        type="text"
        inputMode="numeric"
        pattern="\d{4}"
        required
        placeholder="e.g. 1995"
        aria-describedby="birthYear-help"
        defaultValue={defaultValue}
      />
      <small id="birthYear-help" className="field-help">
        Dazi is for adults only. Others only see an age range. It can&apos;t be changed later.
      </small>
    </p>
  );
}

export function BasicsFields({ values }: { values: ProfileFormValues }) {
  return (
    <>
      <p className="field">
        <label htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" required maxLength={50} defaultValue={values.displayName} />
      </p>

      <p className="field">
        <label htmlFor="gender">Gender (optional)</label>
        <select id="gender" name="gender" defaultValue={values.gender} aria-describedby="gender-help">
          <option value="">Prefer not to say</option>
          {GENDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <small id="gender-help" className="field-help">
          {GENDER_HELP}
        </small>
      </p>

      <fieldset>
        <legend>Languages you speak (at least one)</legend>
        <div className="choice-group">
          {LANGUAGES.map((o) => (
            <label key={o.value} className="choice">
              <input
                type="checkbox"
                name="languages"
                value={o.value}
                defaultChecked={values.languages.includes(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="field">
        <label htmlFor="homeCity">Home city</label>
        <input id="homeCity" name="homeCity" required maxLength={80} defaultValue={values.homeCity} />
      </p>

      <p className="field">
        <label htmlFor="bio">About you (optional, up to 500 characters)</label>
        <textarea id="bio" name="bio" rows={4} maxLength={500} defaultValue={values.bio} aria-describedby="bio-help" />
        <small id="bio-help" className="field-help">
          No contact details (email or phone) — those are shared later, only if you both agree.
        </small>
      </p>

      <p className="field">
        <label htmlFor="visitedCities">Cities you love to travel to (optional, comma-separated)</label>
        <input id="visitedCities" name="visitedCities" defaultValue={values.visitedCities} placeholder="Lisbon, Tokyo, Mexico City" />
      </p>

      <p className="field">
        <label htmlFor="hobbies">Hobbies (optional, comma-separated)</label>
        <input id="hobbies" name="hobbies" defaultValue={values.hobbies} placeholder="film photography, bouldering, vinyl" />
      </p>

      <fieldset>
        <legend>Who would you like to meet? (private, only used for matching)</legend>
        <div className="inline-fields">
          <p className="field">
            <label htmlFor="prefAgeMin">Age from</label>
            <input id="prefAgeMin" name="prefAgeMin" type="number" min={18} max={99} required defaultValue={values.prefAgeMin} />
          </p>
          <p className="field">
            <label htmlFor="prefAgeMax">to</label>
            <input id="prefAgeMax" name="prefAgeMax" type="number" min={18} max={99} required defaultValue={values.prefAgeMax} />
          </p>
          <p className="field">
            <label htmlFor="prefGender">Gender</label>
            <select id="prefGender" name="prefGender" defaultValue={values.prefGender}>
              <option value="">Anyone</option>
              {PREF_GENDERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </p>
        </div>
      </fieldset>
    </>
  );
}

export function StyleFields({ values }: { values: ProfileFormValues }) {
  return (
    <>
      <fieldset>
        <legend>Travel pace</legend>
        <div className="choice-group" data-layout="stack">
          {TRAVEL_PACES.map((o) => (
            <label key={o.value} className="choice">
              <input type="radio" name="travelPace" value={o.value} required defaultChecked={values.travelPace === o.value} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Day rhythm</legend>
        <div className="choice-group">
          {DAY_RHYTHMS.map((o) => (
            <label key={o.value} className="choice">
              <input type="radio" name="dayRhythm" value={o.value} required defaultChecked={values.dayRhythm === o.value} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Travel interests (at least one)</legend>
        <div className="choice-group">
          {TRAVEL_INTERESTS.map((o) => (
            <label key={o.value} className="choice">
              <input
                type="checkbox"
                name="travelInterests"
                value={o.value}
                defaultChecked={values.travelInterests.includes(o.value)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="form-error" role="alert" aria-live="polite">
      {error}
    </p>
  );
}
