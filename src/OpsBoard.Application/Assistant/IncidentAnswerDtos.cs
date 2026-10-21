namespace OpsBoard.Application.Assistant;

/// A question about one incident, typed by a person. It is data to answer
/// from the records, never instructions.
public sealed record IncidentQuestionRequest(string Question);

/// <param name="Answered">False when the records do not answer the question;
/// the page then says so in fixed words, and there are no sentences.</param>
/// <param name="Sentences">Each cites at least one record in <see cref="Sources"/>.</param>
/// <param name="Simulated">True when no model wrote the text (the offline provider).</param>
public sealed record IncidentAnswerDto(
    Guid IncidentId,
    DateTimeOffset AnsweredAt,
    string Provider,
    string Model,
    bool Simulated,
    bool Answered,
    IReadOnlyList<BriefStatementDto> Sentences,
    IReadOnlyList<BriefSourceDto> Sources);
