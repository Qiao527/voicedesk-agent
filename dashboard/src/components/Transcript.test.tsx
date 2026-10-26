import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Transcript } from "./Transcript";

describe("<Transcript>", () => {
  it("renders one bubble per turn", () => {
    render(<Transcript text={"AI: Thanks for calling.\nCaller: Do you take Delta Dental?"} callerName="Jordan Lee" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Do you take Delta Dental?")).toBeInTheDocument();
    expect(screen.getByText("JL")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<Transcript text={null} callerName={null} />);
    expect(screen.getByText("No transcript for this call.")).toBeInTheDocument();
  });
});
